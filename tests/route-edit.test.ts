import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseMap} from '../src/map/parse';
import {GameplayNavigation} from '../src/navigation';
import {CameraRoute,PathFollower,validateRoute,type RouteConfig} from '../src/route';
import {assertAnchorsUnchanged,controls,insertControl,moveControl,removeControl} from '../src/route-edit';
const bytes=readFileSync(new URL('../public/maps/for-site.map',import.meta.url));
const map=parseMap(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
const config:RouteConfig={...JSON.parse(readFileSync(new URL('./fixtures/mandatory-20261024.json',import.meta.url),'utf8')),zoom:1.1};
const nav=new GameplayNavigation(map,1.1),original=new CameraRoute(config,nav);
const p=original.at(original.pointDistances[1]*.45),hit=original.hit(p);
const added=insertControl(config,hit.leg,hit.insert,{id:'manual-test',x:p.x,y:p.y});
const leg=(r:CameraRoute,i:number)=>r.geometry.filter((_,j)=>r.distances[j]>=r.pointDistances[i]&&r.distances[j]<=r.pointDistances[i+1]);
test('click-line projection adds a persisted handle in the correct span without changing anchors',()=>{
  assert.equal(hit.leg,0);assert.equal(hit.insert,0);assert.ok(hit.gap<1e-6);assert.equal(controls(added).length,1);assertAnchorsUnchanged(config,added);assert.deepEqual(added.points,config.points);assert.deepEqual(added.sections,config.sections);
  assert.deepEqual(validateRoute(JSON.parse(JSON.stringify(added))),added);
});
test('move/delete handle rebuild only its leg; unrelated sections are exactly unchanged',()=>{
  const q=original.at(original.pointDistances[1]*.5),moved=moveControl(added,'manual-test',q.x,q.y),edited=new CameraRoute(moved,nav);
  for(let i=1;i<config.points.length-1;i++)assert.deepEqual(leg(edited,i),leg(original,i));
  const at=edited.at(edited.distances[edited.spans[0].end]);assert.ok(Math.hypot(at.x-q.x,at.y-q.y)<1e-6);
  for(let i=1;i<edited.geometry.length;i++)assert.ok(nav.visible(edited.geometry[i-1],edited.geometry[i]));
  const deleted=removeControl(moved,'manual-test');assert.equal(controls(deleted).length,0);assert.deepEqual(new CameraRoute(deleted,nav).geometry,original.geometry);
});
test('locked seven anchors cannot be moved/deleted/reordered/rebound by control tools or import',()=>{
  assert.throws(()=>moveControl(config,'home',100,100));assert.throws(()=>removeControl(config,'features'));
  for(const change of [(r:RouteConfig)=>r.points[0].x++,(r:RouteConfig)=>r.points.reverse(),(r:RouteConfig)=>r.sections.features='home']){const bad=structuredClone(config);change(bad);assert.throws(()=>assertAnchorsUnchanged(config,bad));}
});
test('invalid handle stays at requested coordinates; rejection never moves it or touches source',()=>{
  const bad=moveControl(added,'manual-test',2500,32),before=structuredClone(bad);assert.throws(()=>new CameraRoute(bad,nav),/стене/);assert.deepEqual(bad,before);assert.equal(controls(bad)[0].x,2500);assertAnchorsUnchanged(config,bad);
});
test('multiple controls retain explicit order, unique IDs, consecutive leg ownership',()=>{
  const q=original.at(original.pointDistances[1]*.6),many=insertControl(added,0,1,{id:'manual-second',x:q.x,y:q.y}),edited=new CameraRoute(many,nav);
  assert.deepEqual(controls(many).map(p=>p.id),['manual-test','manual-second']);assert.equal(edited.spans.filter(s=>s.leg===0).length,3);
  const bad=structuredClone(many);bad.segments![0].to='download';assert.throws(()=>validateRoute(bad));
  const duplicate=structuredClone(many);duplicate.segments![0].points[1].id='home';assert.throws(()=>validateRoute(duplicate));
});
test('wheel traverses the edited route and section transitions retain fixed zoom',()=>{
  const r=new CameraRoute(added,nav),f=new PathFollower(r);f.scroll(r.length);let last=f.advance(0);
  for(let i=0;i<8000;i++){const p=f.advance(1/120);assert.equal(p.zoom,1.1);assert.ok(nav.visible(last,p));last=p;}assert.equal(f.distance,r.length);
  f.scroll(-r.length);for(let i=0;i<8000;i++)f.advance(1/120);assert.equal(f.distance,0);
  f.goTo('features');for(let i=0;i<8000;i++)f.advance(1/120);assert.equal(f.distance,r.section('features'));
});
test('no small control-count cap; realistic dense corrections survive JSON roundtrip',()=>{
  const dense=structuredClone(config);dense.segments=[{from:'home',to:'start-gate',points:Array.from({length:300},(_,i)=>({id:`control-${i}`,x:1000+i,y:1700}))}];assert.equal(controls(validateRoute(JSON.parse(JSON.stringify(dense)))).length,300);
});
