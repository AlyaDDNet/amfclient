import {GameplayNavigation, type Position} from './navigation';
export type Section='home'|'features'|'download';
export interface Waypoint {id:string;x:number;y:number;zoom:number;mandatory?:boolean}
export interface RouteControl {id:string;x:number;y:number}
export interface RouteSegment {from:string;to:string;points:RouteControl[]}
export interface RouteConfig {version:1;mode?:'freehand';zoom?:number;points:Waypoint[];sections:Record<Section,string>;segments?:RouteSegment[];editableAnchors?:boolean}
export function validateRoute(raw:unknown):RouteConfig {
  const r=raw as RouteConfig;
  if(!r||r.version!==1||!Array.isArray(r.points)||r.points.length>(r.mode==='freehand'?10000:128))throw Error('Слишком много точек маршрута');
  if(r.mode!==undefined&&r.mode!=='freehand')throw Error('Неизвестный режим маршрута');
  if(r.mode==='freehand'&&r.segments?.length)throw Error('Нарисованный маршрут не использует автокоррекции');
  if(r.editableAnchors!==undefined&&typeof r.editableAnchors!=='boolean')throw Error('Некорректный режим редактирования точек');
  if(r.zoom!==undefined&&(!Number.isFinite(r.zoom)||r.zoom<.25||r.zoom>6))throw Error('Некорректный постоянный масштаб');
  const ids=new Set<string>();
  for(const p of r.points){
    if(typeof p.id!=='string'||!p.id||p.id.length>64||ids.has(p.id)||![p.x,p.y,p.zoom].every(Number.isFinite)||Math.abs(p.x)>1e6||Math.abs(p.y)>1e6||p.zoom<.25||p.zoom>6||p.mandatory!==undefined&&typeof p.mandatory!=='boolean')throw Error('Некорректная точка маршрута');ids.add(p.id);
  }
  for(const s of ['home','features','download'] as Section[])if(!r.sections||typeof r.sections[s]!=='string'||r.sections[s]!==''&&!ids.has(r.sections[s]))throw Error(`Раздел ${s} не назначен существующей точке`);
  if(r.points.some((p,i)=>i>0&&Math.hypot(p.x-r.points[i-1].x,p.y-r.points[i-1].y)<.01))throw Error('Соседние точки должны иметь разные координаты');
  if(r.segments!==undefined){
    if(!Array.isArray(r.segments))throw Error('Некорректные корректирующие точки');
    const pairs=new Set<string>();
    for(const segment of r.segments){
      const i=r.points.findIndex(p=>p.id===segment.from),key=JSON.stringify([segment.from,segment.to]);
      if(i<0||r.points[i+1]?.id!==segment.to||pairs.has(key)||!Array.isArray(segment.points))throw Error('Корректирующие точки должны принадлежать одному существующему участку');pairs.add(key);
      let last:Position=r.points[i];
      for(const p of [...segment.points,r.points[i+1]]){
        if(!p||![p.x,p.y].every(Number.isFinite)||Math.abs(p.x)>1e6||Math.abs(p.y)>1e6||Math.hypot(p.x-last.x,p.y-last.y)<.01)throw Error('Некорректная или совпадающая корректирующая точка');last=p;
      }
      for(const p of segment.points){if(typeof p.id!=='string'||!p.id||p.id.length>64||ids.has(p.id))throw Error('ID корректирующей точки должен быть уникальным');ids.add(p.id);}
    }
  }
  return structuredClone(r);
}
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export class TravelPath {
  readonly distances:number[]=[0];readonly length:number;
  constructor(readonly geometry:Position[],readonly zoom:number){
    for(let i=1;i<geometry.length;i++)this.distances.push(this.distances[i-1]+Math.hypot(geometry[i].x-geometry[i-1].x,geometry[i].y-geometry[i-1].y));
    this.length=this.distances.at(-1)!;
  }
  at(distance:number){
    if(!this.geometry.length)return {id:'camera',x:0,y:0,zoom:this.zoom};
    const s=clamp(distance,0,this.length);let lo=0,hi=this.geometry.length-1;
    while(lo+1<hi){const m=(lo+hi)>>1;if(this.distances[m]<s)lo=m;else hi=m;}
    const a=this.geometry[lo],b=this.geometry[hi],span=this.distances[hi]-this.distances[lo],t=span?(s-this.distances[lo])/span:0;
    return {id:'camera',x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),zoom:this.zoom};
  }
  curvature(d:number){const a=this.at(d-16),b=this.at(d),c=this.at(d+16),ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),ac=Math.hypot(c.x-a.x,c.y-a.y);return ab*bc*ac<.001?0:2*Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/(ab*bc*ac);}
}
export class CameraRoute extends TravelPath {
  readonly config:RouteConfig;readonly pointDistances:number[];
  readonly spans:{leg:number;insert:number;start:number;end:number}[];
  constructor(config:RouteConfig,readonly navigation?:GameplayNavigation){
    const c=validateRoute(config),zoom=c.zoom??c.points[0]?.zoom??1.1,geometry:Position[]=c.points.length?[c.points[0]]:[],indices=c.points.length?[0]:[],spans:{leg:number;insert:number;start:number;end:number}[]=[];
    if(navigation)for(const p of c.points){if(c.mode==='freehand'){if(p.x<0||p.y<0||p.x>navigation.width*32||p.y>navigation.height*32)throw Error(`${p.id}: за границами карты`);}else if(!navigation.visible(p,p))throw Error(`${p.id}: точка в стене или вне игровой области`);}
    for(let i=1;i<c.points.length;i++){
      const controls=c.segments?.find(s=>s.from===c.points[i-1].id&&s.to===c.points[i].id)?.points??[];
      const chain=[c.points[i-1],...controls,c.points[i]];
      const paths:Position[][]=[];
      for(let j=1;j<chain.length;j++){
        let leg:Position[];
        try{leg=navigation&&c.mode!=='freehand'?navigation.path(chain[j-1],chain[j]):[chain[j-1],chain[j]];}
        catch(e){throw Error(`${chain[j-1].id} → ${chain[j].id}: ${(e as Error).message}`);}
        paths.push(leg);
      }
      if(navigation&&c.mode!=='freehand')for(let j=1;j<paths.length;j++)[paths[j-1],paths[j]]=navigation.smoothJunction(paths[j-1],paths[j]);
      for(const [j,path] of paths.entries()){const start=geometry.length-1;geometry.push(...path.slice(1));spans.push({leg:i-1,insert:j,start,end:geometry.length-1});}
      indices.push(geometry.length-1);
    }
    super(geometry,zoom);this.config=c;this.pointDistances=indices.map(i=>this.distances[i]);this.spans=spans;
    if(!Number.isFinite(this.length))throw Error('Некорректная длина маршрута');
  }
  override at(distance:number){if(!this.geometry.length)return {id:'camera',x:(this.navigation?.width??0)*16,y:(this.navigation?.height??0)*16,zoom:this.zoom};return super.at(distance);}
  section(s:Section){return this.pointDistances[this.config.points.findIndex(p=>p.id===this.config.sections[s])]??0;}
  nearestSection(d:number):Section{return (['home','features','download'] as Section[]).reduce((best,s)=>Math.abs(this.section(s)-d)<Math.abs(this.section(best)-d)?s:best,'home');}
  nearest(p:Position){
    return this.hit(p).distance;
  }
  hit(p:Position){
    if(this.geometry.length<2)return {distance:0,gap:Infinity,point:{...p},leg:-1,insert:0};
    let best=Infinity,at=0;
    let edge=1,point:Position=this.geometry[0];
    for(let i=1;i<this.geometry.length;i++){
      const a=this.geometry[i-1],b=this.geometry[i],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1),d=Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
      if(d<best){best=d;at=mix(this.distances[i-1],this.distances[i],t);edge=i;point={x:a.x+dx*t,y:a.y+dy*t};}
    }
    const span=this.spans.find(s=>edge>s.start&&edge<=s.end)!;
    return {distance:at,gap:best,point,leg:span.leg,insert:span.insert};
  }
  slice(a:number,b:number):Position[]{
    const points:Position[]=[this.at(a)];
    if(a<=b){for(let i=0;i<this.geometry.length;i++)if(this.distances[i]>a&&this.distances[i]<b)points.push(this.geometry[i]);}
    else for(let i=this.geometry.length-1;i>=0;i--)if(this.distances[i]<a&&this.distances[i]>b)points.push(this.geometry[i]);
    points.push(this.at(b));return points;
  }
}
export class PathFollower {
  distance=0;target=0;velocity=0;automatic=false;
  private transfer?:{path:TravelPath;s:number;from:number;to:number};
  private pending?:{kind:'navigate'|'manual';to:number};
  constructor(public route:CameraRoute){}
  private position(){return this.transfer?this.transfer.path.at(this.transfer.s):this.route.at(this.distance);}
  goTo(section:Section){this.goToDistance(this.route.section(section));}
  goToPoint(id:string){const i=this.route.config.points.findIndex(p=>p.id===id);if(i<0)throw Error('Неизвестная точка');this.goToDistance(this.route.pointDistances[i]);}
  private goToDistance(destination:number){
    this.target=destination;this.automatic=true;
    if(Math.abs(this.velocity)>2){this.pending={kind:'navigate',to:destination};return;}
    this.pending=undefined;
    this.beginNavigation(destination);
  }
  private beginNavigation(destination:number){
    const current=this.position();
    if(this.route.config.mode!=='freehand'&&this.route.navigation&&(this.transfer||Math.abs(destination-this.distance)>1)){
      let geometry:Position[];
      try{geometry=this.route.navigation.path(current,this.route.at(destination));}
      catch{const near=this.route.nearest(current);const connector=this.route.navigation.path(current,this.route.at(near));geometry=[...connector,...this.route.slice(near,destination).slice(1)];}
      const candidate=new TravelPath(geometry,this.route.zoom),mainLength=Math.abs(destination-this.distance);
      if(this.transfer||candidate.length<mainLength-.5)this.transfer={path:candidate,s:0,from:this.distance,to:destination};
    }
    this.target=destination;this.automatic=true;this.velocity=0;
  }
  scroll(delta:number){
    if(this.pending||this.transfer&&Math.abs(this.velocity)>2){
      const to=clamp((this.pending?.kind==='manual'?this.pending.to:this.route.nearest(this.position()))+delta,0,this.route.length);
      this.pending={kind:'manual',to};this.target=to;this.automatic=false;return;
    }
    if(this.transfer){
      // Resume via a checked connector at the EXACT current camera position.
      const p=this.position(),near=this.route.nearest(p),to=clamp(near+delta,0,this.route.length);
      const connector=this.route.navigation!.path(p,this.route.at(near));
      const geometry=[...connector,...this.route.slice(near,to).slice(1)];
      this.transfer={path:new TravelPath(geometry,this.route.zoom),s:0,from:this.distance,to};this.target=to;this.velocity=0;
    }else {if(this.automatic)this.target=this.distance;this.target=clamp(this.target+delta,0,this.route.length);}
    this.automatic=false;
  }
  advance(dt:number){
    if(!this.route.length){this.seek(0);return this.route.at(0);}
    const steps=Math.max(1,Math.ceil(Math.min(Math.max(dt,0),.1)*120)),h=Math.min(Math.max(dt,0),.1)/steps;
    for(let i=0;i<steps;i++){
      const t=this.transfer,path=t?.path??this.route,d=t?.s??this.distance,target=t?path.length:this.target,error=target-d;
      if(this.pending){
        // Keep world velocity continuous when a new path would change heading.
        // First decelerate along the existing checked path, then join the new
        // one from the actual stopping point. No instantaneous zero/reversal.
        const old=this.velocity;this.velocity*=Math.exp(-12*h);
        const next=clamp(d+(old+this.velocity)*.5*h,0,path.length);
        if(t){t.s=next;this.distance=mix(t.from,t.to,path.length?next/path.length:1);if(next===path.length){this.distance=t.to;this.transfer=undefined;this.velocity=0;}}
        else this.distance=next;
        if(Math.abs(this.velocity)<.5){
          this.velocity=0;const action=this.pending;this.pending=undefined;
          if(action.kind==='navigate')this.beginNavigation(action.to);
          else if(this.transfer){const p=this.position(),near=this.route.nearest(p),connector=this.route.navigation!.path(p,this.route.at(near));this.transfer={path:new TravelPath([...connector,...this.route.slice(near,action.to).slice(1)],this.route.zoom),s:0,from:this.distance,to:action.to};this.target=action.to;}
          else this.target=action.to;
        }
        continue;
      }
      const cap=Math.min(1000,Math.sqrt(600/Math.max(path.curvature(d),1e-8)));
      const desired=Math.sign(error)*Math.min(cap,Math.abs(error)*4,Math.sqrt(2*1200*Math.abs(error)));
      this.velocity+=(desired-this.velocity)*(1-Math.exp(-9*h));
      const move=this.velocity*h;
      const next=(Math.abs(error)<.015&&Math.abs(this.velocity)<.1)||(Math.sign(move)===Math.sign(error)&&Math.abs(move)>Math.abs(error))?target:clamp(d+move,0,path.length);
      if(t){t.s=next;this.distance=mix(t.from,t.to,path.length?next/path.length:1);if(next===target){this.distance=this.target=t.to;this.transfer=undefined;this.velocity=0;}}
      else this.distance=next;
      if(next===target)this.velocity=0;
    }
    return this.position();
  }
  seek(distance:number){this.pending=undefined;this.transfer=undefined;this.distance=this.target=clamp(distance,0,this.route.length);this.velocity=0;this.automatic=false;}
}
