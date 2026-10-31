import type { Color, Envelope, Quad, Vec2 } from './types';
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const cubic=(a:number,b:number,c:number,d:number,t:number)=>{const s=1-t;return s*s*s*a+3*s*s*t*b+3*s*t*t*c+t*t*t*d;};
export function evaluateEnvelope(env:Envelope|undefined,timeMs:number,fallback:Color):Color {
  const p=env?.points;
  if(!p?.length)return [...fallback];
  if(p.length===1)return [...p[0].values];
  const end=p[p.length-1].time;
  // JS remainder matches C++ for negative offsets (no artificial wrap-forward).
  const time=end>0?timeMs%end:0;
  let lo=0,hi=p.length-2,index=-1;
  while(lo<=hi){const mid=(lo+hi)>>1;if(time>=p[mid].time&&time<p[mid+1].time){index=mid;break;}if(time<p[mid].time)hi=mid-1;else lo=mid+1;}
  if(index<0)return [...p[p.length-1].values];
  const a=p[index],b=p[index+1],delta=b.time-a.time;
  if(delta<=0)return [...a.values];
  let t=(time-a.time)/delta;
  if(a.curve===5&&a.bezier&&b.bezier){
    return a.values.map((y,ch)=>{
      const x1=clamp(a.time+a.bezier!.outX[ch],a.time,b.time), x2=clamp(b.time+b.bezier!.inX[ch],a.time,b.time);
      // Monotonic time component: solve x(u)=time independently per channel.
      let l=0,r=1;for(let i=0;i<40;i++){const m=(l+r)/2;if(cubic(a.time,x1,x2,b.time,m)<time)l=m;else r=m;}
      return cubic(y,y+a.bezier!.outY[ch],b.values[ch]+b.bezier!.inY[ch],b.values[ch],(l+r)/2);
    }) as Color;
  }
  switch(a.curve){case 0:t=0;break;case 2:t=t*t*t;break;case 3:t=1-(1-t)**3;break;case 4:t=t*t*(3-2*t);break;}
  return a.values.map((v,i)=>v+(b.values[i]-v)*t) as Color;
}
export function quadPosition(q:Quad,envelopes:Envelope[],timeMs:number):{points:Vec2[];offset:Vec2;angle:number}{
  const env=evaluateEnvelope(envelopes[q.posEnv],timeMs+q.posEnvOffset,[0,0,0,0]);
  const angle=env[2]*Math.PI/180, c=Math.cos(angle),s=Math.sin(angle),pivot=q.points[4];
  const points=q.points.slice(0,4).map(([x,y])=>{
    // Native DDNet rotates in 22.10 fixed point and truncates back to int.
    const dx=(x-pivot[0])*1024,dy=(y-pivot[1])*1024;
    return [Math.trunc(dx*c-dy*s+pivot[0]*1024)/1024+env[0],Math.trunc(dx*s+dy*c+pivot[1]*1024)/1024+env[1]] as Vec2;
  });
  return {points,offset:[env[0],env[1]],angle};
}
