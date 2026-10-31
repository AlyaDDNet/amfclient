import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseMap } from '../src/map/parse';
import { evaluateEnvelope, quadPosition } from '../src/map/envelope';
import { CAMERA_VERTICAL_OFFSET_VIEWPORT_FRACTION, cameraWithVerticalOffset, createTileBorderCache, findForegroundLayerStart, groupView, tileBorderVertices, tileUV, speedupGeometry } from '../src/map/renderer';
import type { Envelope, Color, Quad, TileLayer } from '../src/map/types';
const bytes=readFileSync(new URL('../public/maps/for-site.map',import.meta.url));
const map=parseMap(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
test('For Site v2 parses with embedded images and animation data intact',()=>{
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'0a5afd9a829e641250a874e7a5155143e8dbfb355ebfe52ca0238240b979170e');
  assert.equal(map.layers.length,28);assert.equal(map.groups.length,8);assert.equal(map.images.length,17);
  assert.equal(map.metadata.gameWidth,237);assert.equal(map.metadata.gameHeight,70);
  assert.equal(map.warnings.length,0);assert.equal(map.metadata.animatedQuads,2);assert.equal(map.envelopes.length,2);
  for(const i of map.images){assert.equal(i.external,false);assert.equal(i.pixels!.byteLength,i.width*i.height*4);}
});
test('foreground composition begins at the real winter doodad layer and preserves native layer order',()=>{
  const start=findForegroundLayerStart(map);assert.equal(start,12);
  const front=map.layers[start];assert.ok(front?.kind==='tiles');
  assert.equal(map.images[front.image]?.name,'winter_doodads1');
  assert.equal(map.layers.slice(0,start).length,12);
  assert.equal(map.layers.length,28);
});
test('actual main and auxiliary entity data, never derived from decorative artwork',()=>{
  const game=map.layers.find(l=>l.kind==='tiles'&&(l.tileFlags&1));assert.ok(game?.kind==='tiles');
  assert.equal(game.tiles.filter((v,i)=>i%4===0&&v!==0).length,12218);
  const kinds=map.layers.filter(l=>l.kind==='tiles'&&l.tileFlags).map(l=>l.kind==='tiles'&&l.tileFlags);
  assert.deepEqual(kinds,[1,8,2,32,4]);
  for(const l of map.layers)if(l.kind==='tiles')assert.equal(l.tiles.length,l.width*l.height*4);
});
test('actual cloud envelopes move independently of camera and loop at native times',()=>{
  const layer=map.layers[7];assert.ok(layer.kind==='quads');const q=layer.quads[0];
  const initial=quadPosition(q,map.envelopes,0),mid=quadPosition(q,map.envelopes,45000),end=quadPosition(q,map.envelopes,90000);
  assert.equal(mid.offset[0],980);assert.equal(mid.points[0][0]-initial.points[0][0],980);assert.deepEqual(initial,end);
  assert.equal(evaluateEnvelope(map.envelopes[1],10000,[0,0,0,0])[0],0);
  assert.equal(evaluateEnvelope(map.envelopes[1],65000,[0,0,0,0])[0],980);
});
function env(curve:number):Envelope{return {channels:4,synchronized:true,points:[{time:0,curve,values:[0,0,0,0]},{time:1000,curve:1,values:[1,1,1,1]}]};}
test('native step / linear / slow / fast / smooth curves, color alpha and offsets',()=>{
  for(const [curve,value] of [[0,0],[1,.5],[2,.125],[3,.875],[4,.5]])assert.equal(evaluateEnvelope(env(curve),500,[1,1,1,1])[3],value);
  assert.deepEqual(evaluateEnvelope(undefined,42,[1,1,1,1]),[1,1,1,1]);
  assert.deepEqual(evaluateEnvelope(env(1),1000,[0,0,0,0]),[0,0,0,0]);
  assert.deepEqual(evaluateEnvelope(env(1),-5,[0,0,0,0]),[1,1,1,1]);
});
test('Bezier solves monotonic time per channel and uses tangent deltas',()=>{
  const e=env(5);e.points[0].bezier={inX:[0,0,0,0],inY:[0,0,0,0],outX:[1000/3,1000/3,1000/3,1000/3],outY:[1,0,0,0]};
  e.points[1].bezier={inX:[-1000/3,-1000/3,-1000/3,-1000/3],inY:[0,0,0,0],outX:[0,0,0,0],outY:[0,0,0,0]};
  const result=evaluateEnvelope(e,500,[0,0,0,0]);assert.ok(Math.abs(result[0]-.875)<1e-8);assert.ok(Math.abs(result[1]-.5)<1e-8);
});
test('moving quad position / pivot rotation / color are composable with parallax',()=>{
  const e:Envelope={channels:3,synchronized:true,points:[{time:0,curve:1,values:[10,20,90,0]}]};
  const q:Quad={points:[[0,0],[2,0],[0,2],[2,2],[1,1]],colors:Array(4).fill([1,1,1,1] as Color),uv:[[0,0],[1,0],[0,1],[1,1]],posEnv:0,posEnvOffset:0,colorEnv:-1,colorEnvOffset:0};
  const p=quadPosition(q,[e],0);assert.deepEqual(p.points[0],[12,20]);
  const a=groupView({x:100,y:200,zoom:2},16/9,{offset:[3,4],parallax:[50,50]}),b=groupView({x:200,y:300,zoom:2},16/9,{offset:[3,4],parallax:[50,50]});
  assert.equal(b.x-a.x,50);assert.equal(b.y-a.y,50);assert.ok(Math.abs(a.width-2144.761058952721)<1e-8);
});
test('all eight tile orientation combinations have four distinct corners',()=>{for(const flags of [0,1,2,3,8,9,10,11])assert.equal(new Set(tileUV(34,flags,1024,1024).map(p=>p.join(','))).size,4);});
test('camera target is raised by 13% of the visible game view without changing route state or zoom',()=>{
  const camera={x:1200,y:780,zoom:1.1},snapshot={...camera};
  assert.equal(CAMERA_VERTICAL_OFFSET_VIEWPORT_FRACTION,.13);
  for(const aspect of [1920/1080,1366/768,390/844]){
    const before=groupView(camera,aspect,{offset:[0,0],parallax:[100,100]}),adjusted=cameraWithVerticalOffset(camera,aspect),after=groupView(adjusted,aspect,{offset:[0,0],parallax:[100,100]});
    assert.equal(adjusted.x,camera.x);assert.equal(adjusted.zoom,camera.zoom);
    assert.ok(Math.abs((before.y+before.height/2)-(after.y+after.height/2)-before.height*.13)<1e-8);
  }
  assert.deepEqual(camera,snapshot);
});
function makeTileLayer(width:number,height:number):TileLayer{return {kind:'tiles',id:0,name:'',image:0,flags:0,width,height,tileFlags:0,tiles:new Uint8Array(width*height*4),color:[1,1,1,1],colorEnv:-1,colorEnvOffset:0,marks:[]};}
function putTile(layer:TileLayer,x:number,y:number,index:number,flags=0){const at=(y*layer.width+x)*4;layer.tiles[at]=index;layer.tiles[at+1]=flags;}
test('tile border extends real edge tiles and corners while preserving UV orientation and empty edges',()=>{
  const layer=makeTileLayer(3,2);putTile(layer,0,0,1,9);putTile(layer,1,0,2);putTile(layer,0,1,3,2);putTile(layer,2,1,4);
  const view={x:-32,y:-32,width:160,height:128},cache=createTileBorderCache(layer,256,256),vertices=tileBorderVertices(cache,layer.width,layer.height,view);
  assert.equal(vertices.length/(6*8),10); // 2 top + 2 bottom + 2 left + 1 right + 3 non-empty corners
  const boundsOf=(quad:number)=>{const p=vertices.slice(quad*48,quad*48+48);return {x0:Math.min(p[0],p[8],p[16],p[24],p[32],p[40]),x1:Math.max(p[0],p[8],p[16],p[24],p[32],p[40]),y0:Math.min(p[1],p[9],p[17],p[25],p[33],p[41]),y1:Math.max(p[1],p[9],p[17],p[25],p[33],p[41])};};
  assert.deepEqual(boundsOf(0),{x0:0,x1:32,y0:-32,y1:0});
  assert.deepEqual(boundsOf(2),{x0:0,x1:32,y0:64,y1:96});
  assert.deepEqual(boundsOf(4),{x0:-32,x1:0,y0:0,y1:32});
  assert.deepEqual(boundsOf(7),{x0:-32,x1:0,y0:-32,y1:0});
  for(let q=0;q<10;q++){const b=boundsOf(q);assert.equal(b.x1-b.x0,32);assert.equal(b.y1-b.y0,32);}
  assert.deepEqual(vertices.slice(0,4),[0,-32,...tileUV(1,9,256,256)[0]]);
  const empty=makeTileLayer(2,2);assert.equal(tileBorderVertices(createTileBorderCache(empty,256,256),2,2,{x:-32,y:-32,width:128,height:128}).length,0);
});
test('real map boundary cache includes Game/Entities data, tolerates removed Tele layer, and speedup geometry stays finite',()=>{
  const game=map.layers.find(l=>l.kind==='tiles'&&(l.tileFlags&1));assert.ok(game?.kind==='tiles');
  const gameBorder=createTileBorderCache(game,1024,1024),gameVertices=tileBorderVertices(gameBorder,game.width,game.height,{x:-64,y:-64,width:game.width*32+128,height:game.height*32+128});
  assert.ok(gameVertices.length>0);assert.ok(gameVertices.every(Number.isFinite));
  const tele=map.layers.find(l=>l.kind==='tiles'&&(l.tileFlags&2));assert.ok(tele?.kind==='tiles');assert.equal(tele.tiles.some((value,index)=>index%4===0&&value!==0),false);
  const speedups=map.layers.find(l=>l.kind==='tiles'&&(l.tileFlags&4));assert.ok(speedups?.kind==='tiles');
  const speedupBorder=tileBorderVertices(createTileBorderCache(speedups,256,256),speedups.width,speedups.height,{x:-64,y:-64,width:speedups.width*32+128,height:speedups.height*32+128});
  assert.ok(speedupBorder.every(Number.isFinite));
});
test('speedup border reuses the edge mark rotation and its real arrow texture coordinates',()=>{
  const layer=makeTileLayer(1,1);layer.tileFlags=4;putTile(layer,0,0,29);
  layer.marks=[{x:16,y:16,text:'500',angle:90,force:500}];
  const vertices=tileBorderVertices(createTileBorderCache(layer,64,64),1,1,{x:0,y:0,width:96,height:32});
  assert.equal(vertices.length/(6*8),2);
  for(let q=0;q<2;q++){
    const xs=Array.from({length:6},(_,i)=>vertices[q*48+i*8]);
    assert.ok(Math.abs(Math.min(...xs)-(32+32*q))<1e-9);assert.ok(Math.abs(Math.max(...xs)-(64+32*q))<1e-9);
  }
  assert.deepEqual(vertices.slice(2,4),[0,0]);
  assert.deepEqual(vertices.slice(10,12),[1,0]);
  assert.deepEqual(vertices.slice(48+2,48+4),[0,0]);
});
test('far-off visible border work is bounded to viewport tile cells and corners repeat natively',()=>{
  const layer=makeTileLayer(1,1);putTile(layer,0,0,7,3);
  const view={x:-320,y:-192,width:96,height:64};
  const vertices=tileBorderVertices(createTileBorderCache(layer,256,256),1,1,view);
  assert.equal(vertices.length/(6*8),6); // 3×2 corner cells; no off-screen border geometry
  for(let q=0;q<6;q++){
    const x=Array.from({length:6},(_,i)=>vertices[q*48+i*8]),y=Array.from({length:6},(_,i)=>vertices[q*48+i*8+1]);
    assert.equal(Math.max(...x)-Math.min(...x),32);assert.equal(Math.max(...y)-Math.min(...y),32);
  }
  const expectedUV=tileUV(7,3,256,256);
  assert.deepEqual(vertices.slice(0,4),[view.x,view.y,...expectedUV[0]]);
});
test('official Comfort atlas is byte-identical to the verified BestClient resource',()=>{
  const png=readFileSync(new URL('../public/assets/ddnet-entities.png',import.meta.url));
  assert.equal(createHash('sha256').update(png).digest('hex'),'4cbf66df078a56ffaf245b658638a54f50b5dab5681e6bd6d7272dff42688e50');
  assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),1024);
});
test('Comfort atlas retains DDNet index cells for every actual entity, including auxiliary layers',()=>{
  const present=new Set<number>();for(const layer of map.layers)if(layer.kind==='tiles'&&layer.tileFlags)for(let i=0;i<layer.tiles.length;i+=4)if(layer.tiles[i])present.add(layer.tiles[i]);
  // Include real-map indices and tele/switch/unfreeze indices to guard identity mapping.
  for(const index of new Set([...present,1,2,3,9,11,26,27,28,29,33,34,68]))for(const flags of [0,1,2,3,8,9,10,11]){
    const coords=tileUV(index,flags,1024,1024),col=index%16,row=Math.floor(index/16);
    for(const [u,v] of coords){assert.equal(Math.floor(u*16),col);assert.equal(Math.floor(v*16),row);}
  }
});
test('corrupt and truncated map fails explicitly',()=>{assert.throws(()=>parseMap(new ArrayBuffer(20)),/DATA/);const bad=bytes.slice(0,100);assert.throws(()=>parseMap(bad.buffer.slice(bad.byteOffset,bad.byteOffset+bad.byteLength)));});
test('real speedup arrows use raw native angles/parameters, not tele/checkpoint atlas cell 28',()=>{
  const layer=map.layers.find(l=>l.kind==='tiles'&&(l.tileFlags&4));assert.ok(layer?.kind==='tiles');assert.equal(layer.marks.length,8);
  for(const mark of layer.marks){assert.ok(Number.isFinite(mark.angle));assert.ok((mark.force??0)>0);const geometry=speedupGeometry(mark);assert.ok(Math.abs(geometry.reduce((s,p)=>s+p[0],0)/4-mark.x)<1e-8);assert.ok(Math.abs(geometry.reduce((s,p)=>s+p[1],0)/4-mark.y)<1e-8);assert.ok(Math.abs(Math.hypot(geometry[1][0]-geometry[0][0],geometry[1][1]-geometry[0][1])-32)<1e-8);}
  assert.deepEqual(speedupGeometry({x:16,y:16,text:'',angle:0}),[[0,0],[32,0],[32,32],[0,32]]);
});
