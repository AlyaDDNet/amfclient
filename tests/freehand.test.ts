import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CameraRoute,PathFollower,validateRoute,type RouteConfig} from '../src/route';
import {appendStroke,smoothStroke,RouteHistory,deleteRange,asFreehand} from '../src/freehand';
import {readFileSync} from 'node:fs';
import {removeControl} from '../src/route-edit';
import {emptyRoute} from '../src/route-edit';
const base:RouteConfig={version:1,mode:'freehand',zoom:1.1,editableAnchors:true,points:[],sections:{home:'',features:'',download:''}};
const line=[{id:'a',x:10,y:10},{id:'b',x:70,y:80},{id:'c',x:15,y:20},{id:'d',x:150,y:150}];
test('freehand never calls Game Layer A* or collision veto, including section navigation',()=>{
  const nav={width:10,height:10,visible(){throw Error('unexpected collision check');},path(){throw Error('unexpected A*');}};
  const config=appendStroke(base,line);config.sections.download='d';
  const route=new CameraRoute(config,nav as any),f=new PathFollower(route);
  assert.deepEqual(route.geometry,config.points);f.goTo('download');for(let i=0;i<3000;i++)f.advance(1/60);assert.ok(Math.abs(f.distance-route.length)<.01);
  f.goTo('home');for(let i=0;i<3000;i++)f.advance(1/60);assert.ok(f.distance<.01);
});
test('local smoothing keeps endpoints, stays inside sample hull and preserves loops',()=>{
  const result=smoothStroke(line);assert.deepEqual(result[0],line[0]);assert.deepEqual(result.at(-1),line.at(-1));
  for(let i=1;i<result.length-1;i++)for(const k of ['x','y'] as const){assert.ok(result[i][k]>=Math.min(...line.slice(i-1,i+2).map(p=>p[k])));assert.ok(result[i][k]<=Math.max(...line.slice(i-1,i+2).map(p=>p[k])));}
  assert.ok(result[2].x<result[1].x);
});
test('continuation, sections and persisted JSON use the drawn points exactly',()=>{
  const first=appendStroke(base,line),next=appendStroke(first,[{id:'join',x:150,y:150},{id:'e',x:190,y:160}]);
  assert.equal(next.points.length,5);assert.deepEqual(next.points.slice(0,4),first.points);next.sections.features='c';next.sections.download='e';
  const loaded=validateRoute(JSON.parse(JSON.stringify(next)));assert.deepEqual(loaded,next);assert.equal(new CameraRoute(loaded).section('features'),new CameraRoute(loaded).pointDistances[2]);
});
test('undo/redo snapshots, clear and redo invalidation do not mutate previous route',()=>{
  const h=new RouteHistory(),r=appendStroke(base,line);h.push(base);h.push(r);const cleared=emptyRoute(r);assert.equal(cleared.mode,'freehand');assert.equal(new CameraRoute(cleared).length,0);
  assert.deepEqual(h.undo(cleared),r);assert.deepEqual(h.redo(r),cleared);h.push(r);assert.equal(h.canRedo,false);assert.equal(base.points.length,0);
});
test('map bounds remain enforced without moving a point or rejecting walls',()=>{
  const r=appendStroke(base,line),nav={width:10,height:10} as any;new CameraRoute(r,nav);
  r.points[0].x=-1;assert.throws(()=>new CameraRoute(r,nav),/границами/);assert.equal(r.points[0].x,-1);
});
test('wheel forward/back and automatic interruption stay on exact drawn arc at fixed zoom',()=>{
  const route=new CameraRoute(appendStroke(base,line)),f=new PathFollower(route);f.scroll(route.length);for(let i=0;i<1200;i++){const p=f.advance(1/60),expected=route.at(f.distance);assert.deepEqual(p,expected);assert.equal(p.zoom,1.1);}assert.ok(f.distance>route.length-.01);
  f.scroll(-route.length);for(let i=0;i<1200;i++)f.advance(1/60);assert.ok(f.distance<.01);
});
test('delete a chosen interior range, repair dangling sections, and undo exactly',()=>{
  const r=appendStroke(base,line);r.sections.features='b';const h=new RouteHistory();h.push(r);
  const changed=deleteRange(r,'b','c');assert.deepEqual(changed.points.map(p=>p.id),['a','d']);assert.equal(changed.sections.features,'a');assert.deepEqual(h.undo(changed),r);assert.equal(r.points.length,4);
});
test('user wall correction can be removed even when old generated route is invalid',()=>{
  const r=validateRoute(JSON.parse(readFileSync(new URL('./fixtures/mandatory-20261024.json',import.meta.url),'utf8')));
  r.zoom=1.1;r.segments=[{from:'start-gate',to:'features',points:[{id:'control-e4b5bf4e',x:2738.3268572598035,y:1277.8606549358244}]}];
  const result=removeControl(r,'control-e4b5bf4e');assert.equal(result.segments?.length,0);assert.deepEqual(result.points,r.points);assert.deepEqual(result.sections,r.sections);
});
test('old anchors + wall correction convert in place without clearing, A* or changing bindings',()=>{
  const r=validateRoute(JSON.parse(readFileSync(new URL('./fixtures/mandatory-20261024.json',import.meta.url),'utf8')));
  r.zoom=1.1;r.segments=[{from:'start-gate',to:'features',points:[{id:'control-e4b5bf4e',x:2738.3268572598035,y:1277.8606549358244}]}];
  const before=structuredClone(r),converted=asFreehand(r);assert.deepEqual(r,before);assert.equal(converted.points.length,8);assert.equal(converted.points[2].id,'control-e4b5bf4e');assert.deepEqual(converted.points.filter(p=>p.mandatory),r.points);assert.deepEqual(converted.sections,r.sections);assert.equal(converted.zoom,1.1);assert.deepEqual(asFreehand(converted),converted);
  const route=new CameraRoute(converted,{width:237,height:70,path(){throw Error('unexpected A*');},visible(){throw Error('unexpected collision');}} as any);
  assert.deepEqual(route.geometry,converted.points);const f=new PathFollower(route);f.goTo('features');for(let i=0;i<5000;i++)f.advance(1/60);assert.ok(Math.abs(f.distance-route.section('features'))<.01);
});
