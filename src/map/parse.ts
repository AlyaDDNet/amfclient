import { DataFile, intString } from './datafile';
import type { MapModel, Layer, TileLayer, QuadLayer, Color, EnvPoint } from './types';
const BEZIER='3ab4f84dd9cc3c78b5850d6ccdb2e25c';
const AUTOMAPPER='3e1b2716178c39789bd9b11ae0410dd8';
export function parseMap(buffer:ArrayBuffer):MapModel {
  const f=new DataFile(buffer),warnings:string[]=[];
  const warn=(s:string)=>{if(!warnings.includes(s))warnings.push(s);};
  const uuidMap=new Map<number,string>();
  for(const item of f.ofType(65535))uuidMap.set(item.id,item.ints.map(n=>(n>>>0).toString(16).padStart(8,'0')).join(''));
  for(const [type,uuid] of uuidMap)if(uuid!==BEZIER&&uuid!==AUTOMAPPER)warn(`UUID extension ${uuid} (type ${type}) не интерпретируется`);
  const images=f.ofType(2).map(({ints:a})=>{
    if(a[0]!==1&&a[0]!==2)throw new Error(`Неподдерживаемая версия изображения ${a[0]}`);
    const name=f.string(a[4]), width=a[1],height=a[2],external=!!a[3];
    if(width<1||height<1||width>8192||height>8192)throw new Error(`Недопустимый размер изображения ${name}`);
    const pixels=external?undefined:f.data(a[5]);
    if(pixels&&pixels.length!==width*height*4)throw new Error(`Не-RGBA изображение ${name}: ${pixels.length} байт`);
    return {name,width,height,external,pixels};
  });
  const envItems=f.ofType(3), upstreamBezier=envItems.some(i=>i.ints[0]>=3);
  const pointsItem=f.ofType(6)[0];
  const pointInts=pointsItem?.ints??[];
  const stride=upstreamBezier?22:6;
  const tangentItem=f.items.find(i=>uuidMap.get(i.type)===BEZIER);
  const allPoints:EnvPoint[]=[];
  if(pointInts.length%stride)throw new Error('Некорректный размер envelope points');
  for(let at=0;at<pointInts.length;at+=stride){
    const values=pointInts.slice(at+2,at+6).map(n=>n/1024) as Color;
    const p:EnvPoint={time:pointInts[at],curve:pointInts[at+1],values};
    const tang=upstreamBezier?pointInts.slice(at+6,at+22):tangentItem?.ints.slice((at/stride)*16,(at/stride+1)*16);
    if(tang?.length===16)p.bezier={inX:tang.slice(0,4),inY:tang.slice(4,8).map(n=>n/1024),outX:tang.slice(8,12),outY:tang.slice(12,16).map(n=>n/1024)};
    if(p.curve===5&&!p.bezier)warn('Bezier без tangent data: линейный fallback по правилу DDNet');
    if(p.curve>5||p.curve<0)warn(`Envelope curve ${p.curve}: линейный fallback по правилу DDNet`);
    allPoints.push(p);
  }
  const envelopes=envItems.map(({ints:a})=>{
    if(a[2]<0||a[3]<0||a[2]+a[3]>allPoints.length)throw new Error('Envelope ссылается на отсутствующие points');
    const points=allPoints.slice(a[2],a[2]+a[3]);
    if(points.some((p,i)=>i>0&&p.time<points[i-1].time))throw new Error('Envelope points не упорядочены');
    return {channels:a[1],synchronized:a[0]===1||!!a[12],points};
  });
  const layers:Layer[]=f.ofType(5).map(({id,ints:a})=>{
    if(a[1]===2){
      const [width,height,flags]=a.slice(4,7), count=width*height;
      if(width<1||height<1||count>2_000_000)throw new Error('Недопустимый размер tilemap');
      if(a[3]<2||a[3]>3)throw new Error(`Tile layer version ${a[3]} не поддерживается; слой ${id}`);
      const data=f.data(a[14]);
      if(data.length!==count*4)throw new Error(`Tile data ${id}: ожидается ${count*4} байт, получено ${data.length}`);
      const layer:TileLayer={kind:'tiles',id,name:intString(a.slice(15,18)),image:a[13],flags:a[2],width,height,tileFlags:flags,tiles:data,color:a.slice(7,11).map(n=>n/255) as Color,colorEnv:a[11],colorEnvOffset:a[12],marks:[]};
      // DDNet auxiliary layers store authoritative tile indices in separate raw blocks.
      let raw:Uint8Array|undefined,step=0,kind='';
      const base=a[3]===2?15:18;
      if(flags&2){raw=f.data(a[base]);step=2;kind='tele';}
      else if(flags&4){raw=f.data(a[base+1]);step=6;kind='speedup';}
      else if(flags&8){raw=f.data(a[base+2]);step=4;kind='front';}
      else if(flags&16){raw=f.data(a[base+3]);step=4;kind='switch';}
      else if(flags&32){raw=f.data(a[base+4]);step=2;kind='tune';}
      if(raw){
        if(raw.length!==count*step)throw new Error(`Неверная длина ${kind} layer ${id}`);
        layer.tiles=new Uint8Array(count*4);
        for(let i=0;i<count;i++){
          const at=i*step,type=kind==='front'?raw[at]:kind==='speedup'?raw[at+2]:raw[at+1];
          layer.tiles[i*4]=type;
          if(kind==='front')layer.tiles[i*4+1]=raw[at+1];
          if(kind==='switch')layer.tiles[i*4+1]=raw[at+2];
          if(type&&kind!=='front'){
            let text=String(raw[at]);let angle:number|undefined;
            if(kind==='speedup'){text=`${raw[at]}/${raw[at+1]}`;angle=new DataView(raw.buffer,raw.byteOffset+at+4,2).getInt16(0,true);}
            if(kind==='switch'&&raw[at+3])text+=`:${raw[at+3]}`;
            layer.marks.push({x:(i%width)*32+16,y:Math.floor(i/width)*32+16,text,angle,...(kind==='speedup'?{force:raw[at],maxSpeed:raw[at+1]}:{})});
          }
        }
      }
      return layer;
    }
    if(a[1]===3){
      const raw=f.data(a[5]);
      if(a[4]<0||raw.length!==a[4]*152)throw new Error(`Неверный размер quad layer ${id}`);
      const dv=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),quads:QuadLayer['quads']=[];
      for(let i=0;i<a[4];i++){
        const v=Array.from({length:38},(_,j)=>dv.getInt32(i*152+j*4,true));
        quads.push({points:Array.from({length:5},(_,j)=>[v[j*2]/1024,v[j*2+1]/1024]),colors:Array.from({length:4},(_,j)=>v.slice(10+j*4,14+j*4).map(n=>n/255) as Color),uv:Array.from({length:4},(_,j)=>[v[26+j*2]/1024,v[27+j*2]/1024]),posEnv:v[34],posEnvOffset:v[35],colorEnv:v[36],colorEnvOffset:v[37]});
      }
      return {kind:'quads',id,name:intString(a.slice(7,10)),image:a[6],flags:a[2],quads};
    }
    throw new Error(`Неподдерживаемый тип слоя ${a[1]} (id ${id}); он не будет молча пропущен`);
  });
  const groups=f.ofType(4).map(({ints:a})=>({name:intString(a.slice(12,15)),offset:[a[1],a[2]] as [number,number],parallax:[a[3],a[4]] as [number,number],start:a[5],count:a[6],clip:a[0]>=2&&a[7]?a.slice(8,12) as [number,number,number,number]:undefined}));
  for(const g of groups)if(g.start<0||g.count<0||g.start+g.count>layers.length)throw new Error('Group ссылается на отсутствующий слой');
  for(const l of layers){
    if(l.image < -1 || l.image>=images.length)throw new Error(`Отсутствует изображение слоя ${l.id}`);
    const envIds=l.kind==='tiles'?[l.colorEnv]:l.quads.flatMap(q=>[q.posEnv,q.colorEnv]);
    if(envIds.some(e=>e < -1 || e>=envelopes.length))throw new Error(`Отсутствует envelope слоя ${l.id}`);
  }
  for(const i of f.items)if(![0,1,2,3,4,5,6,65535].includes(i.type)&&!uuidMap.has(i.type))warn(`Item type ${i.type} не поддерживается`);
  const game=layers.find(l=>l.kind==='tiles'&&(l.tileFlags&1)) as TileLayer|undefined;
  const info=f.ofType(1)[0]?.ints??[];
  return {version:f.version,images,layers,groups,envelopes,warnings,metadata:{author:f.string(info[1]??-1),license:f.string(info[4]??-1),sourceBytes:buffer.byteLength,gameWidth:game?.width??0,gameHeight:game?.height??0,tiles:layers.reduce((s,l)=>s+(l.kind==='tiles'?l.tiles.filter((v,i)=>i%4===0&&v!==0).length:0),0),quads:layers.reduce((s,l)=>s+(l.kind==='quads'?l.quads.length:0),0),animatedQuads:layers.reduce((s,l)=>s+(l.kind==='quads'?l.quads.filter(q=>q.posEnv>=0).length:0),0),colorBindings:layers.reduce((s,l)=>s+(l.kind==='tiles'?(l.colorEnv>=0?1:0):l.quads.filter(q=>q.colorEnv>=0).length),0),rawDataBytes:f.rawBytes,uuidItems:[...uuidMap.values()]}};
}
