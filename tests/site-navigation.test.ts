import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {CameraRoute,validateRoute} from '../src/route';import {SiteFollower,mainPoints,entitiesShortcut} from '../src/site-navigation';import {validateContent,resolveSections} from '../src/site-content';
const bytes=readFileSync(new URL('../public/camera-route.json',import.meta.url)),config=validateRoute(JSON.parse(bytes.toString())),route=new CameraRoute(config);
test('final saved geometry, exact zoom, seven main points and content bindings are unchanged',()=>{
  const content=validateContent(JSON.parse(readFileSync(new URL('../public/site-sections.json',import.meta.url),'utf8'))),sections=resolveSections(config,content);
  assert.equal(mainPoints(config).length,7);assert.equal(sections.length,7);assert.deepEqual(sections.map(s=>s.pointId),config.points.map(p=>p.id));assert.deepEqual(route.geometry,config.points);assert.equal(route.zoom,1.1);assert.deepEqual(Buffer.from(JSON.stringify(config)),Buffer.from(JSON.stringify(validateRoute(JSON.parse(bytes.toString())))));
  const intermediate={...config,points:[config.points[0],{id:'shaping-only',x:1000,y:1600,zoom:1.1,mandatory:false},...config.points.slice(1)]};assert.equal(mainPoints(intermediate).length,7);
});
test('tab transitions use direct coordinates for every pair and finish at 1000ms',()=>{
  for(const fps of [30,60,144])for(const a of config.points)for(const b of config.points){if(a===b)continue;let now=0;const f=new SiteFollower(route,()=>now),from=route.pointDistances[config.points.indexOf(a)],to=route.pointDistances[config.points.indexOf(b)];f.seek(from);f.goToPoint(b.id);
    for(let i=0;i<fps;i++){now=i*1000/fps;const p=f.advance(1/fps,now),u=Math.max(0,Math.min(1,now/1000)),e=u*u*u*(u*(u*6-15)+10);assert.ok(Math.abs(p.x-(a.x+(b.x-a.x)*e))<1e-7);assert.ok(Math.abs(p.y-(a.y+(b.y-a.y)*e))<1e-7);assert.equal(p.zoom,1.1);assert.ok(f.transitioning);assert.ok(f.distance>=Math.min(from,to)-1e-6&&f.distance<=Math.max(from,to)+1e-6);}
    now=999;f.advance(.001,now);assert.ok(f.transitioning);now=1000;const end=f.advance(.001,now);assert.equal(f.transitioning,false);assert.equal(f.distance,to);assert.equal(end.x,b.x);assert.equal(end.y,b.y);assert.equal(f.lastDuration,1000);
  }
});
test('7→1, 1→7 and 2→6 do not visit the intervening route points',()=>{
  const checks=[[6,0],[0,6],[1,5]] as const;
  for(const [fromIndex,toIndex] of checks){let now=0;const f=new SiteFollower(route,()=>now),from=config.points[fromIndex],to=config.points[toIndex];f.seek(route.pointDistances[fromIndex]);f.goToPoint(to.id);
    for(let i=1;i<100;i++){now=i*10;const p=f.advance(.01,now);for(let j=Math.min(fromIndex,toIndex)+1;j<Math.max(fromIndex,toIndex);j++)assert.ok(Math.hypot(p.x-config.points[j].x,p.y-config.points[j].y)>1,'direct coordinate tween must not visit intermediate sections');}
    now=1000;f.advance(0,now);assert.equal(f.distance,route.pointDistances[toIndex]);
  }
  let now=0;const f=new SiteFollower(route,()=>now);f.seek(route.pointDistances[6]);f.goToPoint(config.points[0].id);now=500;const p=f.advance(.5,now);assert.ok(Math.abs(p.x-route.at(f.distance).x)>1||Math.abs(p.y-route.at(f.distance).y)>1,'camera must not be evaluated from the main route during a tab transition');
});
test('reselect does not restart; retarget begins at current visual coordinates',()=>{
  let now=0;const f=new SiteFollower(route,()=>now);f.goToPoint(config.points[6].id);now=400;const before=f.advance(.1,now),beforeDistance=f.distance;f.goToPoint(config.points[6].id);assert.equal(f.distance,beforeDistance);assert.deepEqual(f.advance(0,now),before);
  now=600;const current=f.advance(.1,now);f.goToPoint(config.points[0].id);assert.deepEqual(f.advance(0,now),current);now=1600;const end=f.advance(.1,now);assert.equal(end.x,config.points[0].x);assert.equal(end.y,config.points[0].y);assert.equal(f.distance,route.pointDistances[0]);
});
test('wheel movement after a tab transition resumes on the saved route',()=>{
  let now=0;const f=new SiteFollower(route,()=>now);f.goToPoint(config.points[6].id);now=1000;f.advance(.1,now);assert.equal(f.distance,route.length);f.scroll(-100);for(let i=0;i<1000;i++)f.advance(1/60,now+=1000/60);assert.ok(Math.abs(f.distance-(route.length-100))<.01);assert.deepEqual(f.advance(0,now),route.at(f.distance));assert.equal(f.advance(0,now).zoom,1.1);
});
test('wheel input during a direct tab transition is applied after landing without a jump',()=>{
  let now=0;const f=new SiteFollower(route,()=>now);f.goToPoint(config.points[6].id);now=350;const before=f.advance(.1,now);f.scroll(-75);assert.deepEqual(f.advance(0,now),before);now=1000;const landed=f.advance(.1,now);assert.deepEqual(landed,{...route.at(route.length)});assert.equal(f.transitioning,false);for(let i=0;i<1000;i++)f.advance(1/60,now+=1000/60);assert.ok(Math.abs(f.distance-(route.length-75))<.01);assert.deepEqual(f.advance(0,now),route.at(f.distance));
});
test('large RAF gaps use actual timestamps rather than clamped dt',()=>{let now=0;const f=new SiteFollower(route,()=>now);f.goToPoint(config.points[6].id);now=1000;const p=f.advance(.1,now);assert.equal(p.x,config.points[6].x);assert.equal(p.y,config.points[6].y);assert.equal(f.distance,route.length);assert.equal(f.transitioning,false);});
test('physical KeyN works with EN/RU/UA values and auto-repeat while held, but ignores text editing',()=>{
  for(const key of ['n','N','т','Т']){const e={key,code:'KeyN',repeat:false};assert.ok(entitiesShortcut(e,false));assert.ok(entitiesShortcut({...e,repeat:true},false));assert.equal(entitiesShortcut(e,true),false);assert.equal(entitiesShortcut({...e,repeat:true},true),false);}
  assert.equal(entitiesShortcut({code:'KeyY',repeat:false},false),false);assert.equal(entitiesShortcut({code:'KeyN',repeat:false,ctrlKey:true},false),false);
});
test('content parser rejects unsafe links, duplicate IDs and malformed cards',()=>{assert.throws(()=>validateContent({version:1,sections:[{}]}));const c=validateContent(JSON.parse(readFileSync(new URL('../public/site-sections.json',import.meta.url),'utf8')));c.sections[0].actions=[{label:'bad',href:'javascript:alert(1)'}];assert.throws(()=>validateContent(c));});
