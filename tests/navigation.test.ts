import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMap} from '../src/map/parse';
import {GameplayNavigation} from '../src/navigation';
import {CameraRoute,PathFollower,type RouteConfig,TravelPath} from '../src/route';
import {groupView,GAME_GROUP} from '../src/map/renderer';
import {createInitialRoute} from '../src/initial-route';
const bytes=readFileSync(new URL('../public/maps/for-site.map',import.meta.url));
const model=parseMap(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
const original:RouteConfig=JSON.parse(readFileSync(new URL('./fixtures/mandatory-20261024.json',import.meta.url),'utf8'));
const config:RouteConfig={...original,zoom:1.1};
const nav=new GameplayNavigation(model,config.zoom!),route=new CameraRoute(config,nav);
test('initial route derives from actual spawn/start/finish, with no user constraints',()=>{
  const initial=createInitialRoute(model);
  assert.equal(nav.game.tiles[(53*nav.game.width+27)*4],192);
  const front=model.layers.find(l=>l.kind==='tiles'&&(l.tileFlags&8));assert.ok(front?.kind==='tiles');
  assert.ok(front.tiles.some((tile,i)=>i%4===0&&tile===33));assert.ok(front.tiles.some((tile,i)=>i%4===0&&tile===34));
  assert.equal(initial.points.filter(p=>p.mandatory).length,0);assert.ok(new CameraRoute(initial,new GameplayNavigation(model,.5)).length>5000);
});
test('U-shaped solid obstacle: route bends through the opening, not a Catmull corner cut',()=>{
  const m=structuredClone(model),g=structuredClone(nav.game);g.width=40;g.height=30;g.tiles=new Uint8Array(40*30*4);
  for(let y=0;y<=22;y++)g.tiles[(y*40+20)*4]=1;
  m.layers=[g];const n=new GameplayNavigation(m,.25),a={x:14.5*32,y:10.5*32},b={x:26.5*32,y:10.5*32},path=n.path(a,b);
  assert.equal(n.visible(a,b),false);assert.ok(path.some(p=>p.y>23*32));
  for(let i=1;i<path.length;i++)assert.ok(n.visible(path[i-1],path[i]));
  g.tiles[(10*40+14)*4]=192;for(let y=0;y<30;y++)g.tiles[(y*40+20)*4]=3;
  const disconnected=new GameplayNavigation(m,.25);assert.throws(()=>disconnected.path(a,b));
});
test('every generated/smoothed chord is collision-safe, including diagonal tile corners',()=>{
  for(let i=1;i<route.geometry.length;i++)assert.ok(nav.visible(route.geometry[i-1],route.geometry[i]),`chord ${i}`);
  assert.equal(nav.visible({x:1456,y:1488},{x:5968,y:1616}),false,'direct start/finish crosses real solids');
});
test('original fixed zoom 1.1; centre collision independent of viewport and aspect ratio',()=>{
  const other=new CameraRoute({...config,zoom:.34},new GameplayNavigation(model,.34));assert.deepEqual(other.geometry,route.geometry);
  for(let d=0;d<=route.length;d+=8){const p=route.at(d);assert.equal(p.zoom,1.1);assert.ok(nav.valid(p));
    for(const aspect of [3.5,16/9,4/3,1,9/19.5]){const v=groupView(p,aspect,GAME_GROUP);assert.ok(Math.abs(v.x+v.width/2-p.x)<1e-6);}}
  const close=groupView({...route.at(0),zoom:.34},16/9,GAME_GROUP),wide=groupView(route.at(0),16/9,GAME_GROUP);assert.ok(Math.abs(wide.width/close.width-1.1/.34)<1e-9);
});
test('new mandatory constraint passed exactly, no coordinate snapping or mutation',()=>{
  const r=structuredClone(config),p=route.at(route.length*.2);r.points.splice(1,0,{id:'user-test',x:p.x,y:p.y,zoom:.5,mandatory:true});
  const before=structuredClone(r),rebuilt=new CameraRoute(r,nav),i=rebuilt.config.points.findIndex(p=>p.id==='user-test'),at=rebuilt.at(rebuilt.pointDistances[i]);
  assert.ok(Math.hypot(at.x-p.x,at.y-p.y)<1e-6);assert.deepEqual(r,before);
});
test('wall/bounds/disconnected constraints fail explicitly, never move coordinates',()=>{
  for(const p of [{x:2500,y:32},{x:-10,y:1600},{x:7585,y:2241}]){const r=structuredClone(config);r.points.splice(1,0,{id:'invalid-user',...p,zoom:.5,mandatory:true});const old=structuredClone(r);assert.throws(()=>new CameraRoute(r,nav));assert.deepEqual(r,old);}
});
test('all forward/reverse section transfers remain collision-safe and join without a wheel jump',()=>{
  const f=new PathFollower(route);let previous=f.advance(0);
  for(const section of ['features','download','home','download','features','home'] as const){f.goTo(section);
    for(let i=0;i<5000;i++){const p=f.advance(1/60);assert.ok(nav.visible(previous,p),`${section} frame ${i}`);assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y)<18);assert.equal(p.zoom,1.1);previous=p;}
    assert.ok(Math.abs(f.distance-route.section(section))<.02);const p=f.advance(0);f.scroll(section==='home'?200:-200);assert.deepEqual(f.advance(0),p);
  }
});
test('in-flight shortcut interruption is continuous, checked, and manually reversible',()=>{
  const f=new PathFollower(route);f.goTo('download');for(let i=0;i<100;i++)f.advance(1/60);
  const p=f.advance(0);f.scroll(-350);assert.deepEqual(f.advance(0),p);assert.equal(f.automatic,false);
  let last=p;for(let i=0;i<800;i++){const q=f.advance(1/60);assert.ok(nav.visible(last,q));last=q;}
  f.scroll(300);for(let i=0;i<800;i++)f.advance(1/60);assert.ok(nav.valid(f.advance(0)));
});
test('reselecting a destination decelerates without resetting velocity or teleporting',()=>{
  const f=new PathFollower(route);f.goTo('download');for(let i=0;i<180;i++)f.advance(1/60);
  const before=f.advance(0),speed=f.velocity;assert.ok(speed>2);f.goTo('home');assert.equal(f.velocity,speed);assert.deepEqual(f.advance(0),before);
  const next=f.advance(1/120);assert.ok(Math.hypot(next.x-before.x,next.y-before.y)<=speed/120+.01);assert.ok(f.velocity>0&&f.velocity<speed);
  for(let i=0;i<6000;i++)f.advance(1/120);assert.equal(f.distance,0);
});
test('geometric shortcuts may be shorter but never ignore obstacles',()=>{
  const from=route.at(0),to=route.at(route.length),shortcut=new TravelPath(nav.path(from,to),.5);
  assert.ok(shortcut.length<=route.length+1);assert.ok(shortcut.length>Math.hypot(to.x-from.x,to.y-from.y));
});
test('all seven actual user constraints remain byte-for-number identical and are visited in order',()=>{
  const before=structuredClone(config);assert.equal(config.points.length,7);assert.equal(config.points.filter(p=>p.mandatory).length,7);
  for(let i=0;i<config.points.length;i++){const at=route.at(route.pointDistances[i]),p=original.points[i];assert.ok(Math.hypot(at.x-p.x,at.y-p.y)<1e-6);if(i)assert.ok(route.pointDistances[i]>route.pointDistances[i-1]);}
  assert.deepEqual(config,before);assert.ok(new CameraRoute(original,new GameplayNavigation(model,.5)).length>0);
});
test('current published route is valid and does not require moving saved constraints',()=>{
  const saved:RouteConfig=JSON.parse(readFileSync(new URL('../public/camera-route.json',import.meta.url),'utf8'));
  const before=structuredClone(saved);new CameraRoute(saved,new GameplayNavigation(model,saved.zoom??saved.points[0].zoom));assert.deepEqual(saved,before);
});
test('real path controller stable at 30/60/144 FPS and clamped at endpoints',()=>{
  const positions=[];for(const fps of [30,60,144]){const f=new PathFollower(route);f.scroll(route.length+1000);for(let i=0;i<fps*3;i++)f.advance(1/fps);positions.push(f.distance);assert.equal(f.target,route.length);f.seek(-100);assert.equal(f.distance,0);f.seek(route.length+10);assert.equal(f.distance,route.length);}
  assert.ok(Math.max(...positions)-Math.min(...positions)<20);
});
