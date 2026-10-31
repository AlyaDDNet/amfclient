import { evaluateEnvelope, quadPosition } from './envelope';
import type { Color, EntityMark, Group, Layer, MapModel, Quad, TileLayer, Vec2 } from './types';
export interface Camera { x:number; y:number; zoom:number }
export interface ViewRect { x:number; y:number; width:number; height:number }
export const CAMERA_VERTICAL_OFFSET_VIEWPORT_FRACTION = 0.13;
export function groupView(camera:Camera,aspect:number,group:Pick<Group,'offset'|'parallax'>):ViewRect {
  let height=Math.sqrt(1150*1000/aspect),width=height*aspect;
  if(width>1500){width=1500;height=width/aspect;}
  if(height>1050){height=1050;width=height*aspect;}
  const parallaxZoom=Math.max(0,Math.min(100,Math.max(...group.parallax)))/100;
  const zoom=1+parallaxZoom*(camera.zoom-1);
  width*=zoom;height*=zoom;
  return {x:group.offset[0]+camera.x*group.parallax[0]/100-width/2,y:group.offset[1]+camera.y*group.parallax[1]/100-height/2,width,height};
}
export const GAME_GROUP={offset:[0,0] as Vec2,parallax:[100,100] as Vec2};
/** Raises the camera target in map space by a fixed fraction of the visible game view. */
export function cameraWithVerticalOffset(camera:Camera,aspect:number,fraction=CAMERA_VERTICAL_OFFSET_VIEWPORT_FRACTION):Camera {
  const visibleHeight=groupView(camera,aspect,GAME_GROUP).height;
  return {...camera,y:camera.y-visibleHeight*fraction};
}
export function tileUV(index:number,flags:number,width:number,height:number):Vec2[]{
  let coords:Vec2[]=[[0,0],[1,0],[1,1],[0,1]];
  if(flags&1)coords=coords.map(([u,v])=>[1-u,v]);
  if(flags&2)coords=coords.map(([u,v])=>[u,1-v]);
  if(flags&8)coords=[coords[3],coords[0],coords[1],coords[2]];
  const x=(index%16)/16,y=Math.floor(index/16)/16,ix=0.5/width,iy=0.5/height;
  return coords.map(([u,v])=>[x+ix+u*(1/16-2*ix),y+iy+v*(1/16-2*iy)]);
}
export function speedupGeometry(mark:EntityMark):Vec2[]{
  const angle=(mark.angle??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return ([[-16,-16],[16,-16],[16,16],[-16,16]] as Vec2[]).map(([x,y])=>[mark.x+x*c-y*s,mark.y+x*s+y*c]);
}
interface Mesh { buffer:WebGLBuffer; count:number; bounds:ViewRect; quad?:Quad }
interface BorderTile { points:Vec2[]; uv:Vec2[] }
export interface TileBorderCache { top:(BorderTile|undefined)[]; bottom:(BorderTile|undefined)[]; left:(BorderTile|undefined)[]; right:(BorderTile|undefined)[]; corners:[BorderTile|undefined,BorderTile|undefined,BorderTile|undefined,BorderTile|undefined] }
export interface MapRendererOptions { layerStart?: number; layerEnd?: number; alpha?: boolean; shade?: boolean }
interface LayerMesh { layer:Layer; meshes:Mesh[]; border?:TileBorderCache }
interface Texture { handle:WebGLTexture; width:number; height:number }
const UNIT_TILE_POINTS:Vec2[]=[[0,0],[32,0],[32,32],[0,32]];
const SPEEDUP_UV:Vec2[]=[[0,0],[1,0],[1,1],[0,1]];
const VERTEX_ORDER=[0,1,2,0,2,3];
const WHITE:Color=[1,1,1,1];

/** Cache only the actual map perimeter, mirroring DDNet's edge/corner visual caches. */
export function createTileBorderCache(layer:TileLayer,textureWidth:number,textureHeight:number):TileBorderCache {
  const speedups=layer.tileFlags&4?new Map(layer.marks.map(mark=>[Math.floor(mark.y/32)*layer.width+Math.floor(mark.x/32),mark])):undefined;
  const sourceAt=(x:number,y:number):BorderTile|undefined=>{
    const at=(y*layer.width+x)*4,index=layer.tiles[at];
    if(!index)return undefined;
    if(speedups){
      const mark=speedups.get(y*layer.width+x);
      if(!mark||![28,29].includes(index)||(index===28&&!mark.force)||(index===29&&!mark.force&&!mark.maxSpeed))return undefined;
      const originX=x*32,originY=y*32;
      return {points:speedupGeometry(mark).map(([px,py])=>[px-originX,py-originY]),uv:SPEEDUP_UV};
    }
    return {points:UNIT_TILE_POINTS,uv:tileUV(index,layer.tiles[at+1],textureWidth,textureHeight)};
  };
  const top=Array.from({length:layer.width},(_,x)=>sourceAt(x,0));
  const bottom=Array.from({length:layer.width},(_,x)=>sourceAt(x,layer.height-1));
  const left=Array.from({length:layer.height},(_,y)=>sourceAt(0,y));
  const right=Array.from({length:layer.height},(_,y)=>sourceAt(layer.width-1,y));
  return {top,bottom,left,right,corners:[sourceAt(0,0),sourceAt(layer.width-1,0),sourceAt(0,layer.height-1),sourceAt(layer.width-1,layer.height-1)]};
}

/** Build only native-size edge/corner tile copies intersecting the current view. */
export function tileBorderVertices(cache:TileBorderCache,width:number,height:number,view:ViewRect):number[] {
  const out:number[]=[],mapWidth=width*32,mapHeight=height*32;
  const append=(tile:BorderTile|undefined,tileX:number,tileY:number)=>{
    if(!tile)return;
    const points=tile.points.map(([x,y]):Vec2=>[tileX*32+x,tileY*32+y]);
    for(const index of VERTEX_ORDER){const [x,y]=points[index];out.push(x,y,...tile.uv[index],...WHITE);}
  };
  const tileRange=(start:number,end:number,min:number,max:number)=>[
    Math.max(min,Math.floor(start/32)),Math.min(max,Math.ceil(end/32)),
  ] as const;
  const viewRight=view.x+view.width,viewBottom=view.y+view.height;
  const [insideX0,insideX1]=tileRange(Math.max(0,view.x),Math.min(mapWidth,viewRight),0,width);
  const [insideY0,insideY1]=tileRange(Math.max(0,view.y),Math.min(mapHeight,viewBottom),0,height);

  // Extend the nearest row/column. Each repeated source keeps its original 32×32
  // map-space footprint, UVs and orientation; the current view bounds the work.
  if(view.y<0&&insideX0<insideX1){
    const [firstY,lastY]=tileRange(view.y,Math.min(0,viewBottom),Number.NEGATIVE_INFINITY,0);
    for(let x=insideX0;x<insideX1;x++)for(let y=firstY;y<lastY;y++)append(cache.top[x],x,y);
  }
  if(viewBottom>mapHeight&&insideX0<insideX1){
    const [firstY,lastY]=tileRange(Math.max(mapHeight,view.y),viewBottom,height,Number.POSITIVE_INFINITY);
    for(let x=insideX0;x<insideX1;x++)for(let y=firstY;y<lastY;y++)append(cache.bottom[x],x,y);
  }
  if(view.x<0&&insideY0<insideY1){
    const [firstX,lastX]=tileRange(view.x,Math.min(0,viewRight),Number.NEGATIVE_INFINITY,0);
    for(let y=insideY0;y<insideY1;y++)for(let x=firstX;x<lastX;x++)append(cache.left[y],x,y);
  }
  if(viewRight>mapWidth&&insideY0<insideY1){
    const [firstX,lastX]=tileRange(Math.max(mapWidth,view.x),viewRight,width,Number.POSITIVE_INFINITY);
    for(let y=insideY0;y<insideY1;y++)for(let x=firstX;x<lastX;x++)append(cache.right[y],x,y);
  }

  const [leftX0,leftX1]=tileRange(view.x,Math.min(0,viewRight),Number.NEGATIVE_INFINITY,0);
  const [rightX0,rightX1]=tileRange(Math.max(mapWidth,view.x),viewRight,width,Number.POSITIVE_INFINITY);
  const [topY0,topY1]=tileRange(view.y,Math.min(0,viewBottom),Number.NEGATIVE_INFINITY,0);
  const [bottomY0,bottomY1]=tileRange(Math.max(mapHeight,view.y),viewBottom,height,Number.POSITIVE_INFINITY);
  for(let y=topY0;y<topY1;y++)for(let x=leftX0;x<leftX1;x++)append(cache.corners[0],x,y);
  for(let y=topY0;y<topY1;y++)for(let x=rightX0;x<rightX1;x++)append(cache.corners[1],x,y);
  for(let y=bottomY0;y<bottomY1;y++)for(let x=leftX0;x<leftX1;x++)append(cache.corners[2],x,y);
  for(let y=bottomY0;y<bottomY1;y++)for(let x=rightX0;x<rightX1;x++)append(cache.corners[3],x,y);
  return out;
}
const VS=`#version 300 es
in vec2 a_position; in vec2 a_uv; in vec4 a_color;
uniform vec4 u_view; uniform vec2 u_pivot; uniform vec2 u_move; uniform float u_angle;
out vec2 v_uv; out vec4 v_color;
void main(){
 vec2 d=(a_position-u_pivot)*1024.0; float c=cos(u_angle),s=sin(u_angle);
 vec2 p=trunc(vec2(d.x*c-d.y*s,d.x*s+d.y*c)+u_pivot*1024.0)/1024.0+u_move;
 vec2 clip=((p-u_view.xy)/u_view.zw)*2.0-1.0;
 gl_Position=vec4(clip.x,-clip.y,0.0,1.0);v_uv=a_uv;v_color=a_color;
}`;
const FS=`#version 300 es
precision mediump float; in vec2 v_uv; in vec4 v_color;
uniform sampler2D u_texture; uniform vec4 u_color; uniform vec2 u_resolution; uniform bool u_apply_shade; out vec4 outColor;
float ramp(float value,float edge0,float edge1,float a,float b){return mix(a,b,clamp((value-edge0)/(edge1-edge0),0.0,1.0));}
void main(){
 vec4 color=texture(u_texture,v_uv)*v_color*u_color;
 if(u_apply_shade){
  float x=gl_FragCoord.x/u_resolution.x,y=1.0-gl_FragCoord.y/u_resolution.y;
  float horizontal=x<0.38?ramp(x,0.0,0.38,0.74,0.36):(x<0.76?ramp(x,0.38,0.76,0.36,0.02):0.02);
  float vertical=y<0.25?ramp(y,0.0,0.25,0.30,0.0):(y>0.70?ramp(y,0.70,1.0,0.0,0.50):0.0);
  float shade=1.0-(1.0-horizontal)*(1.0-vertical);
  color.rgb=mix(color.rgb,vec3(5.0,13.0,22.0)/255.0,shade);
 }
 outColor=color;
}`;
const intersect=(a:ViewRect,b:ViewRect)=>a.x+a.width>=b.x&&a.y+a.height>=b.y&&a.x<=b.x+b.width&&a.y<=b.y+b.height;
const bounds=(points:Vec2[]):ViewRect=>{const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};};
const SEMANTIC_TILES:Record<string,number>={QFr:9,QUnFr:11,QDeath:2,QStopa:62,QCfrm:9,QHook:1,QUnHook:3};
/** The map's winter doodad tile layer is the first foreground sprite layer around Home. */
export function findForegroundLayerStart(model:MapModel):number {
  const imageIndex=model.images.findIndex(image=>image.name.toLowerCase()==='winter_doodads1');
  if(imageIndex<0)return model.layers.length;
  const layerIndex=model.layers.findIndex(layer=>layer.kind==='tiles'&&layer.image===imageIndex);
  return layerIndex<0?model.layers.length:layerIndex;
}
export class MapRenderer {
  private gl:WebGL2RenderingContext;
  private program:WebGLProgram;
  private textures:(Texture|undefined)[]=[];
  private white:Texture;
  private entity:Texture;
  private speedArrow:Texture;
  private layerMeshes:LayerMesh[];
  private borderBuffer:WebGLBuffer;
  private layerStart:number;
  private layerEnd:number;
  private alpha:boolean;
  private shade:boolean;
  private uniforms:Record<string,WebGLUniformLocation>={};
  private attrs:number[];
  stats={drawCalls:0,visibleChunks:0,triangles:0,cpuMs:0};
  constructor(public canvas:HTMLCanvasElement,public model:MapModel,entityImage:HTMLImageElement,speedArrowImage:HTMLImageElement,options:MapRendererOptions={}){
    this.layerStart=Math.max(0,Math.min(model.layers.length,options.layerStart??0));
    this.layerEnd=Math.max(this.layerStart,Math.min(model.layers.length,options.layerEnd??model.layers.length));
    this.alpha=options.alpha??false;
    this.shade=options.shade??false;
    const gl=canvas.getContext('webgl2',{alpha:this.alpha,antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
    if(!gl)throw new Error('WebGL 2 недоступен. Проверьте аппаратное ускорение браузера.');
    this.gl=gl;
    const compile=(type:number,source:string)=>{const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)??'Shader error');return shader;};
    const vertex=compile(gl.VERTEX_SHADER,VS),fragment=compile(gl.FRAGMENT_SHADER,FS);
    this.program=gl.createProgram()!;gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program)??'WebGL program link error');
    for(const name of ['view','pivot','move','angle','color','texture','resolution','apply_shade'])this.uniforms[name]=gl.getUniformLocation(this.program,`u_${name}`)!;
    this.attrs=['a_position','a_uv','a_color'].map(n=>gl.getAttribLocation(this.program,n));
    this.textures=Array.from({length:model.images.length});
    this.white=this.texture(1,1,new Uint8Array([255,255,255,255]));
    this.entity=this.texture(entityImage.width,entityImage.height,entityImage);
    this.speedArrow=this.texture(speedArrowImage.width,speedArrowImage.height,speedArrowImage);
    this.borderBuffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,this.borderBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(0),gl.DYNAMIC_DRAW);
    this.layerMeshes=model.layers.map((layer,index)=>{
      if(index<this.layerStart||index>=this.layerEnd)return {layer,meshes:[]};
      const texture=layer.kind==='tiles'?(layer.tileFlags&4?this.speedArrow:layer.tileFlags?this.entity:this.mapTexture(layer.image)):undefined;
      return {layer,meshes:layer.kind==='tiles'?this.tileMeshes(layer):layer.quads.map(q=>this.quadMesh(q,SEMANTIC_TILES[layer.name])),border:layer.kind==='tiles'?createTileBorderCache(layer,texture!.width,texture!.height):undefined};
    });
    gl.enable(gl.BLEND);
    if(this.alpha)gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  }
  private texture(width:number,height:number,data:Uint8Array|HTMLImageElement):Texture{
    const gl=this.gl,max=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if(width>max||height>max)throw new Error(`Размер текстуры ${width}×${height} превышает лимит GPU ${max}`);
    const handle=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,handle);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    if(data instanceof Uint8Array)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,data);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    return {handle,width,height};
  }
  private mapTexture(index:number):Texture{
    if(index<0)return this.white;
    const cached=this.textures[index];if(cached)return cached;
    const image=this.model.images[index];
    if(!image)throw new Error(`Карта ссылается на отсутствующее изображение ${index}`);
    if(!image.pixels)throw new Error(`Внешний ресурс ${image.name}.png отсутствует. Добавьте его в public/mapres; ресурсы не подменяются.`);
    const texture=this.texture(image.width,image.height,image.pixels);this.textures[index]=texture;return texture;
  }
  private mesh(vertices:number[],box:ViewRect,quad?:Quad):Mesh{
    const gl=this.gl,buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);return {buffer,count:vertices.length/8,bounds:box,quad};
  }
  private addQuad(out:number[],points:Vec2[],uv:Vec2[],colors:Color[],order=[0,1,2,0,2,3]){for(const i of order)out.push(...points[i],...uv[i],...colors[i]);}
  private tileMeshes(layer:TileLayer):Mesh[]{
    const meshes:Mesh[]=[],image=layer.image>=0?this.model.images[layer.image]:undefined,texture=layer.tileFlags?this.entity:image?{width:image.width,height:image.height}:this.white,color:Color=[1,1,1,1];
    const speedups=layer.tileFlags&4?new Map(layer.marks.map(m=>[Math.floor(m.y/32)*layer.width+Math.floor(m.x/32),m])):undefined;
    for(let y=0;y<layer.height;y+=32)for(let x=0;x<layer.width;x+=32){
      const vertices:number[]=[];
      for(let ty=y;ty<Math.min(y+32,layer.height);ty++)for(let tx=x;tx<Math.min(x+32,layer.width);tx++){
        const at=(ty*layer.width+tx)*4,index=layer.tiles[at];if(!index)continue;
        if(speedups){
          const mark=speedups.get(ty*layer.width+tx);
          if(!mark||![28,29].includes(index)||(index===28&&!mark.force)||(index===29&&!mark.force&&!mark.maxSpeed))continue;
          this.addQuad(vertices,speedupGeometry(mark),[[0,0],[1,0],[1,1],[0,1]],[color,color,color,color]);
          continue;
        }
        const uv=tileUV(index,layer.tiles[at+1],texture.width,texture.height);
        this.addQuad(vertices,[[tx*32,ty*32],[(tx+1)*32,ty*32],[(tx+1)*32,(ty+1)*32],[tx*32,(ty+1)*32]],uv,[color,color,color,color]);
      }
      if(vertices.length){const pad=speedups?16:0;meshes.push(this.mesh(vertices,{x:x*32-pad,y:y*32-pad,width:Math.min(32,layer.width-x)*32+2*pad,height:Math.min(32,layer.height-y)*32+2*pad}));}
    }
    return meshes;
  }
  private quadMesh(q:Quad,_semantic?:number){const data:number[]=[];this.addQuad(data,q.points,q.uv,q.colors,[0,1,3,0,3,2]);return this.mesh(data,bounds(q.points.slice(0,4)),q);}
  resize(){const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.round(this.canvas.clientWidth*dpr),h=Math.round(this.canvas.clientHeight*dpr);if(w!==this.canvas.width||h!==this.canvas.height){this.canvas.width=w;this.canvas.height=h;}this.gl.viewport(0,0,w,h);}
  private bind(mesh:Mesh){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);for(let i=0;i<3;i++){gl.enableVertexAttribArray(this.attrs[i]);gl.vertexAttribPointer(this.attrs[i],i===2?4:2,gl.FLOAT,false,32,i===0?0:i===1?8:16);}}
  draw(camera:Camera,timeMs:number,entities:boolean){
    const start=performance.now(),gl=this.gl;this.resize();gl.disable(gl.SCISSOR_TEST);
    // BestClient's map preview uses neutral 0.5 grey; black native speed arrows
    // need that contrast in Entities. The normal-map clear color is unchanged.
    if(this.alpha)gl.clearColor(0,0,0,0);else if(entities)gl.clearColor(0.5,0.5,0.5,1);else gl.clearColor(0.035,0.055,0.075,1);
    gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);gl.uniform1i(this.uniforms.texture,0);
    gl.uniform2f(this.uniforms.resolution,this.canvas.width,this.canvas.height);gl.uniform1i(this.uniforms.apply_shade,this.shade?1:0);
    const aspect=this.canvas.width/this.canvas.height,gameView=groupView(camera,aspect,GAME_GROUP);
    this.stats.drawCalls=0;this.stats.visibleChunks=0;this.stats.triangles=0;
    for(const group of this.model.groups){
      if(group.start+group.count<=this.layerStart||group.start>=this.layerEnd)continue;
      const view=groupView(camera,aspect,group);
      gl.uniform4f(this.uniforms.view,view.x,view.y,view.width,view.height);
      if(group.clip){
        const [x,y,w,h]=group.clip,sx=this.canvas.width/gameView.width,sy=this.canvas.height/gameView.height;
        gl.enable(gl.SCISSOR_TEST);gl.scissor(Math.round((x-gameView.x)*sx),Math.round(this.canvas.height-(y+h-gameView.y)*sy),Math.max(0,Math.round(w*sx)),Math.max(0,Math.round(h*sy)));
      }else gl.disable(gl.SCISSOR_TEST);
      for(let i=group.start;i<group.start+group.count;i++){
        if(i<this.layerStart||i>=this.layerEnd)continue;
        const {layer,meshes}=this.layerMeshes[i];
        const semantic=layer.kind==='quads'?SEMANTIC_TILES[layer.name]:undefined;
        if(layer.kind==='tiles'&&(entities?!layer.tileFlags:!!layer.tileFlags))continue;
        if(entities&&layer.kind==='quads'&&semantic===undefined)continue;
        const tex=layer.kind==='tiles'&&(layer.tileFlags&4)?this.speedArrow:layer.kind==='tiles'&&layer.tileFlags?this.entity:this.mapTexture(layer.image);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex.handle);
        gl.uniform2f(this.uniforms.pivot,0,0);gl.uniform2f(this.uniforms.move,0,0);gl.uniform1f(this.uniforms.angle,0);
        if(layer.kind==='tiles'){
          const env=evaluateEnvelope(this.model.envelopes[layer.colorEnv],timeMs+layer.colorEnvOffset,[1,1,1,1]);
          gl.uniform4fv(this.uniforms.color,layer.color.map((v,j)=>v*env[j]));
        }
        for(const mesh of meshes){
          if(mesh.quad){
            const q=mesh.quad,transform=q.posEnv>=0?quadPosition(q,this.model.envelopes,timeMs):null;
            const box=transform?bounds(transform.points):mesh.bounds;
            if(!intersect(box,view))continue;
            const env=evaluateEnvelope(this.model.envelopes[q.colorEnv],timeMs+q.colorEnvOffset,[1,1,1,1]);
            if(entities&&semantic!==undefined){
              // Semantic Move Tiles retain actual animated quad geometry; tint is an entities diagnostic.
              gl.bindTexture(gl.TEXTURE_2D,this.white.handle);
              const tint:Color=semantic===9?[0.3,0.6,1,0.8]:semantic===2?[1,0.25,0.3,0.8]:[0.7,0.85,1,0.85];
              gl.uniform4fv(this.uniforms.color,tint.map((v,j)=>v*env[j]));
            }else gl.uniform4fv(this.uniforms.color,env);
            gl.uniform2fv(this.uniforms.pivot,q.points[4]);gl.uniform2fv(this.uniforms.move,transform?.offset??[0,0]);gl.uniform1f(this.uniforms.angle,transform?.angle??0);
          }else if(!intersect(mesh.bounds,view))continue;
          this.bind(mesh);gl.drawArrays(gl.TRIANGLES,0,mesh.count);this.stats.drawCalls++;this.stats.visibleChunks++;this.stats.triangles+=mesh.count/3;
        }
        if(layer.kind==='tiles'&&this.layerMeshes[i].border){
          const vertices=tileBorderVertices(this.layerMeshes[i].border!,layer.width,layer.height,view);
          if(vertices.length){
            gl.bindBuffer(gl.ARRAY_BUFFER,this.borderBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
            for(let attr=0;attr<3;attr++){gl.enableVertexAttribArray(this.attrs[attr]);gl.vertexAttribPointer(this.attrs[attr],attr===2?4:2,gl.FLOAT,false,32,attr===0?0:attr===1?8:16);}
            const count=vertices.length/8;gl.drawArrays(gl.TRIANGLES,0,count);this.stats.drawCalls++;this.stats.visibleChunks++;this.stats.triangles+=count/3;
          }
        }
      }
    }
    gl.disable(gl.SCISSOR_TEST);this.stats.cpuMs=performance.now()-start;
  }
  drawEntityLabels(ctx:CanvasRenderingContext2D,camera:Camera){
    const width=ctx.canvas.clientWidth,height=ctx.canvas.clientHeight,view=groupView(camera,width/height,GAME_GROUP),scale=width/view.width;
    if(scale*32<16)return;
    ctx.font=`${Math.min(12,scale*10)}px ui-monospace, monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(const group of this.model.groups){const v=groupView(camera,width/height,group);for(let i=group.start;i<group.start+group.count;i++){const layer=this.model.layers[i];if(layer.kind!=='tiles')continue;for(const m of layer.marks){if(m.x<v.x||m.y<v.y||m.x>v.x+v.width||m.y>v.y+v.height)continue;const x=(m.x-v.x)/v.width*width,y=(m.y-v.y)/v.height*height;ctx.lineWidth=3;ctx.strokeStyle='#07111d';ctx.fillStyle='#ecf5ff';if(m.angle!==undefined){const force=String(m.force??0);ctx.strokeText(force,x,y+scale*9);ctx.fillText(force,x,y+scale*9);if(m.maxSpeed){ctx.strokeText(String(m.maxSpeed),x,y-scale*9);ctx.fillText(String(m.maxSpeed),x,y-scale*9);}}else{ctx.strokeText(m.text,x,y);ctx.fillText(m.text,x,y);}}}}
  }
  dispose(){const gl=this.gl;for(const {meshes} of this.layerMeshes)for(const mesh of meshes)gl.deleteBuffer(mesh.buffer);gl.deleteBuffer(this.borderBuffer);for(const tex of [...this.textures.filter((texture):texture is Texture=>!!texture),this.white,this.entity,this.speedArrow])gl.deleteTexture(tex.handle);gl.deleteProgram(this.program);}
}
