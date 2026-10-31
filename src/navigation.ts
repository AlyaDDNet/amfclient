import type {MapModel, TileLayer} from './map/types';
export interface Position {x:number;y:number}
const distance=(a:Position,b:Position)=>Math.hypot(a.x-b.x,a.y-b.y);
// One world unit convention throughout: a native DDNet tile is 32 units.
// Freeze is traversable space, not a solid wall. This is camera routing, not Tee physics.
export class GameplayNavigation {
  readonly width:number;readonly height:number;readonly blocked:Uint8Array;
  readonly clearance:Float32Array;readonly game:TileLayer;
  private pathCache=new Map<string,Position[]>();
  constructor(model:MapModel,readonly zoom:number){
    const game=model.layers.find((l):l is TileLayer=>l.kind==='tiles'&&!!(l.tileFlags&1));
    if(!game)throw Error('Game Layer отсутствует');
    this.game=game;this.width=game.width;this.height=game.height;
    this.blocked=new Uint8Array(this.width*this.height);this.clearance=new Float32Array(this.blocked.length);
    // Collision constrains the camera trajectory, NOT the viewport rectangle.
    // Wide framing must never force a zoom change or move authored waypoints.
    // Exclude disconnected decorative pockets. Reachability starts at the real
    // native spawn, before applying viewport margins (which aren't map walls).
    const reachable=new Uint8Array(this.width*this.height),flood:number[]=[];
    const spawn=Array.from({length:reachable.length},(_,i)=>i).find(i=>game.tiles[i*4]===192);
    if(spawn!==undefined){reachable[spawn]=1;flood.push(spawn);
      for(let q=0;q<flood.length;q++){const i=flood[q],x=i%this.width,y=Math.floor(i/this.width);
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,j=ny*this.width+nx;if(nx<0||ny<0||nx>=this.width||ny>=this.height||reachable[j]||[1,2,3].includes(game.tiles[j*4]))continue;reachable[j]=1;flood.push(j);}
      }
    }else reachable.fill(1);
    for(let i=0;i<this.blocked.length;i++){
      const tile=game.tiles[i*4];
      this.blocked[i]=Number(!reachable[i]||[1,2,3].includes(tile));
    }
    // Multi-source distance field. A soft cost prefers corridor centres, but
    // does not arbitrarily forbid the narrow shafts required by the level.
    const queue:number[]=[];this.clearance.fill(Infinity);
    for(let i=0;i<this.blocked.length;i++)if(this.blocked[i]){queue.push(i);this.clearance[i]=0;}
    for(let q=0;q<queue.length;q++){
      const i=queue[q],x=i%this.width,y=Math.floor(i/this.width);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=this.width||ny>=this.height)continue;const n=ny*this.width+nx;if(this.clearance[n]>this.clearance[i]+1){this.clearance[n]=this.clearance[i]+1;queue.push(n);}}
    }
  }
  private cell(p:Position){return Math.floor(p.y/32)*this.width+Math.floor(p.x/32);}
  valid(p:Position){
    if(!Number.isFinite(p.x+p.y)||p.x<0||p.y<0||p.x>=this.width*32||p.y>=this.height*32)return false;
    return !this.blocked[this.cell(p)];
  }
  private travelCost(a:Position,b:Position){
    const length=distance(a,b),steps=Math.max(1,Math.ceil(length/8));let cost=0;
    for(let k=0;k<steps;k++){
      const t=(k+.5)/steps,i=this.cell({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
      cost+=length/steps*(1+1.5/(this.clearance[i]+.25)+(this.game.tiles[i*4]===9?18:0));
    }return cost;
  }
  // Conservative segment-vs-inflated-tile test; sampling alone can miss a
  // clipped corner. A small geometric footprint keeps the centre off walls.
  visible(a:Position,b:Position){
    if(!this.valid(a)||!this.valid(b))return false;
    const radius=3,dx=b.x-a.x,dy=b.y-a.y;
    const x0=Math.max(0,Math.floor((Math.min(a.x,b.x)-radius)/32)),x1=Math.min(this.width-1,Math.floor((Math.max(a.x,b.x)+radius)/32));
    const y0=Math.max(0,Math.floor((Math.min(a.y,b.y)-radius)/32)),y1=Math.min(this.height-1,Math.floor((Math.max(a.y,b.y)+radius)/32));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      if(!this.blocked[y*this.width+x])continue;
      let lo=0,hi=1;
      for(const [v,d,min,max] of [[a.x,dx,x*32-radius,(x+1)*32+radius],[a.y,dy,y*32-radius,(y+1)*32+radius]]){
        if(Math.abs(d)<1e-12){if(v<min||v>max){lo=2;break;}}
        else {const u=(min-v)/d,w=(max-v)/d;lo=Math.max(lo,Math.min(u,w));hi=Math.min(hi,Math.max(u,w));}
      }
      if(lo<=hi)return false;
    }
    return true;
  }
  path(a:Position,b:Position):Position[]{
    a={x:a.x,y:a.y};b={x:b.x,y:b.y};
    if(!this.valid(a)||!this.visible(a,a))throw Error(`Точка (${a.x.toFixed(1)}, ${a.y.toFixed(1)}) в стене, вне игровой области или слишком близко к стене`);
    if(!this.valid(b)||!this.visible(b,b))throw Error(`Точка (${b.x.toFixed(1)}, ${b.y.toFixed(1)}) в стене, вне игровой области или слишком близко к стене`);
    const key=JSON.stringify([a.x,a.y,b.x,b.y]),cached=this.pathCache.get(key);if(cached)return cached.map(p=>({...p}));
    const start=this.cell(a),end=this.cell(b),n=this.blocked.length;
    if(start===end&&this.visible(a,b))return [a,b];
    const costs=new Float64Array(n);costs.fill(Infinity);costs[start]=0;
    const parents=new Int32Array(n);parents.fill(-1);const closed=new Uint8Array(n);
    const heap:{id:number;f:number}[]=[];
    const push=(v:{id:number;f:number})=>{heap.push(v);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].f<=v.f)break;heap[i]=heap[p];i=p;}heap[i]=v;};
    const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first.id;};
    const centre=(i:number)=>({x:(i%this.width+.5)*32,y:(Math.floor(i/this.width)+.5)*32});
    push({id:start,f:distance(a,b)});
    while(heap.length){
      const i=pop();if(closed[i])continue;if(i===end)break;closed[i]=1;
      const x=i%this.width,y=Math.floor(i/this.width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=this.width||ny>=this.height)continue;const j=ny*this.width+nx;
        if(this.blocked[j]||closed[j]||dx&&dy&&(this.blocked[y*this.width+nx]||this.blocked[ny*this.width+x]))continue;
        const p=i===start?a:centre(i),q=j===end?b:centre(j);
        if(!this.visible(p,q))continue;
        const cost=costs[i]+this.travelCost(p,q);
        if(cost>=costs[j])continue;costs[j]=cost;parents[j]=i;push({id:j,f:cost+distance(q,b)});
      }
    }
    if(!Number.isFinite(costs[end]))throw Error('Нет связного игрового прохода между точками. Координаты не изменены.');
    const raw:Position[]=[b];for(let i=parents[end];i!==start;i=parents[i]){if(i<0)throw Error('Повреждён путь');raw.push(centre(i));}raw.push(a);raw.reverse();
    // Visibility simplification removes grid zigzags, without shortcuts through walls.
    const cumulative=[0];for(let k=1;k<raw.length;k++)cumulative.push(cumulative[k-1]+this.travelCost(raw[k-1],raw[k]));
    const simple=[raw[0]];let i=0;
    while(i<raw.length-1){let best=i+1;for(let j=i+2;j<raw.length;j++){
      if(!this.visible(raw[i],raw[j]))break;
      // Do not undo A*'s corridor/air preference by drawing a straight line
      // through a whole freeze mass just because it isn't physically solid.
      if(this.travelCost(raw[i],raw[j])<=(cumulative[j]-cumulative[i])*1.02)best=j;
    }simple.push(raw[best]);i=best;}
    const result=this.round(simple);if(this.pathCache.size>=512)this.pathCache.delete(this.pathCache.keys().next().value!);this.pathCache.set(key,result.map(p=>({...p})));return result;
  }
  private round(points:Position[]):Position[]{
    const result:Position[]=[points[0]];
    for(let i=1;i<points.length-1;i++){
      const a=points[i-1],b=points[i],c=points[i+1];let accepted:Position[]|undefined;
      // Quadratic fillet with shrinking radius; every emitted chord is checked.
      for(let factor=.35;factor>=.01;factor/=2){
        const r=Math.min(distance(a,b),distance(b,c),160)*factor;
        const u={x:b.x+(a.x-b.x)*r/distance(a,b),y:b.y+(a.y-b.y)*r/distance(a,b)},v={x:b.x+(c.x-b.x)*r/distance(b,c),y:b.y+(c.y-b.y)*r/distance(b,c)};
        const curve=[u];for(let k=1;k<=24;k++){const t=k/24,s=1-t;curve.push({x:s*s*u.x+2*s*t*b.x+t*t*v.x,y:s*s*u.y+2*s*t*b.y+t*t*v.y});}
        if(this.visible(result.at(-1)!,u)&&curve.every((p,j)=>!j||this.visible(curve[j-1],p))){accepted=curve;break;}
      }
      result.push(...(accepted??[b]));
    }
    result.push(points.at(-1)!);
    if(result.some((p,i)=>i&&!this.visible(result[i-1],p)))throw Error('Сглаживание пересекло препятствие');
    return result;
  }
  smoothJunction(left:Position[],right:Position[]):[Position[],Position[]]{
    const measure=(ps:Position[])=>{const ds=[0];for(let i=1;i<ps.length;i++)ds.push(ds[i-1]+distance(ps[i-1],ps[i]));return ds;};
    const ld=measure(left),rd=measure(right),ll=ld.at(-1)!,rl=rd.at(-1)!,b=left.at(-1)!;
    const at=(ps:Position[],ds:number[],d:number)=>{let i=1;while(i<ds.length-1&&ds[i]<d)i++;const t=(d-ds[i-1])/(ds[i]-ds[i-1]||1);return {x:ps[i-1].x+(ps[i].x-ps[i-1].x)*t,y:ps[i-1].y+(ps[i].y-ps[i-1].y)*t};};
    const unit=(a:Position,b:Position)=>{const d=distance(a,b)||1;return {x:(b.x-a.x)/d,y:(b.y-a.y)/d};};
    const curve=(a:Position,b:Position,u:Position,v:Position,r:number)=>Array.from({length:25},(_,i)=>{const t=i/24,t2=t*t,t3=t2*t;return {x:(2*t3-3*t2+1)*a.x+(t3-2*t2+t)*u.x*r+(-2*t3+3*t2)*b.x+(t3-t2)*v.x*r,y:(2*t3-3*t2+1)*a.y+(t3-2*t2+t)*u.y*r+(-2*t3+3*t2)*b.y+(t3-t2)*v.y*r};});
    for(let r=Math.min(ll*.25,rl*.25,64);r>1;r/=2){
      const a=at(left,ld,ll-r),c=at(right,rd,r),u=unit(at(left,ld,Math.max(0,ll-r-1)),a),v=unit(c,at(right,rd,Math.min(rl,r+1))),ab=unit(a,b),bc=unit(b,c),sum={x:ab.x+bc.x,y:ab.y+bc.y},norm=Math.hypot(sum.x,sum.y);
      if(norm<.1)return [left,right]; // Never invent a loop for a forced reversal.
      const tangent={x:sum.x/norm,y:sum.y/norm},first=curve(a,b,u,tangent,r*.65),second=curve(b,c,tangent,v,r*.65);
      if([...first, ...second].some((p,i,ps)=>i&&!this.visible(ps[i-1],p)))continue;
      const l=[...left.filter((_,i)=>ld[i]<ll-r),...first],q=[...second,...right.filter((_,i)=>rd[i]>r)];
      if(l.some((p,i)=>i&&!this.visible(l[i-1],p))||q.some((p,i)=>i&&!this.visible(q[i-1],p)))continue;
      return [l,q];
    }return [left,right];
  }
}
