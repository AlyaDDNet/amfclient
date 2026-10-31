import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyRoute,appendAnchor} from '../src/route-edit';
import {CameraRoute,PathFollower,validateRoute,type RouteConfig} from '../src/route';
import {GameplayNavigation} from '../src/navigation';
import {parseMap} from '../src/map/parse';
const source:RouteConfig={...JSON.parse(readFileSync(new URL('./fixtures/mandatory-20261024.json',import.meta.url),'utf8')),zoom:1.1};
const b=readFileSync(new URL('../public/maps/for-site.map',import.meta.url)),m=parseMap(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)),nav=new GameplayNavigation(m,1.1);
test('clear produces a genuinely empty route without mutating the backup or changing zoom',()=>{
  const old=structuredClone(source),empty=emptyRoute(source);assert.deepEqual(source,old);assert.equal(empty.points.length,0);assert.equal(empty.segments?.length,0);assert.deepEqual(empty.sections,{home:'',features:'',download:''});assert.equal(empty.zoom,1.1);assert.equal(empty.editableAnchors,true);
  const route=new CameraRoute(empty,nav);assert.equal(route.length,0);assert.equal(route.geometry.length,0);assert.equal(route.pointDistances.length,0);
});
test('empty persisted JSON remains empty after reload; wheel/nav do not regenerate anything or produce NaN',()=>{
  const saved=validateRoute(JSON.parse(JSON.stringify(emptyRoute(source)))),r=new CameraRoute(saved,nav),f=new PathFollower(r);
  for(const s of ['home','features','download'] as const){f.goTo(s);f.scroll(500);const p=f.advance(1/60);assert.ok(Number.isFinite(p.x+p.y+p.zoom));assert.equal(p.zoom,1.1);assert.equal(f.distance,0);assert.equal(f.target,0);assert.equal(r.geometry.length,0);}
});
test('new zero → one → two-point route can be created, saved and followed',()=>{
  let config=emptyRoute(source);config=appendAnchor(config,{id:'new-start',x:source.points[0].x,y:source.points[0].y});
  const one=new CameraRoute(config,nav);assert.equal(one.geometry.length,1);assert.equal(one.length,0);assert.equal(one.at(0).x,source.points[0].x);
  config=appendAnchor(config,{id:'new-end',x:source.points[1].x,y:source.points[1].y});const r=new CameraRoute(validateRoute(JSON.parse(JSON.stringify(config))),nav);assert.ok(r.length>100);assert.equal(config.sections.home,'new-start');assert.equal(config.sections.download,'new-end');
  assert.equal(config.mode,'freehand');assert.deepEqual(r.geometry,config.points);
});
test('undo/restore original snapshot brings back the exact anchors and generated route',()=>{
  const backup=structuredClone(source),before=new CameraRoute(backup,nav);emptyRoute(source);const restored=new CameraRoute(JSON.parse(JSON.stringify(backup)),nav);assert.deepEqual(restored.config,source);assert.deepEqual(restored.geometry,before.geometry);
});
test('empty JSON cannot retain dangling references; freehand accepts walls but rejects outside-map coordinates',()=>{
  const bad=emptyRoute(source);bad.sections.home='old-home';assert.throws(()=>validateRoute(bad));
  const one=appendAnchor(emptyRoute(source),{id:'wall',x:2500,y:32});assert.equal(new CameraRoute(one,nav).geometry.length,1);
  one.points[0].x=-1;assert.throws(()=>new CameraRoute(one,nav),/границами/);
});
test('clear legacy auto route → add the actual two screenshot points → wall-crossing save/reload never returns to A*',()=>{
  let c=emptyRoute(source);assert.equal(c.mode,'freehand');
  c=appendAnchor(c,{id:'point-73c27826',x:1950.1122915033047,y:1266.656034568862});
  c=appendAnchor(c,{id:'point-40953bda',x:2264.5825310121263,y:1303.4882802944621});
  assert.equal(nav.visible(c.points[1],c.points[1]),false,'the user endpoint is actually in solid collision');
  const loaded=validateRoute(JSON.parse(JSON.stringify(c))),route=new CameraRoute(loaded,nav);
  assert.equal(loaded.mode,'freehand');assert.deepEqual(route.geometry,loaded.points);assert.equal(route.at(route.length).x,2264.5825310121263);assert.equal(route.at(route.length).y,1303.4882802944621);assert.equal(route.zoom,1.1);
  // Legacy drafts with editableAnchors but no mode also become manual when a new point is added.
  delete loaded.mode;const continued=appendAnchor(loaded,{id:'extra',x:2300,y:1350});assert.equal(continued.mode,'freehand');new CameraRoute(continued,nav);
});
