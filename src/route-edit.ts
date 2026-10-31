import {validateRoute,type RouteConfig,type RouteControl} from './route';
import {asFreehand} from './freehand';
export function emptyRoute(config:RouteConfig):RouteConfig {return {version:1,mode:'freehand',zoom:config.zoom??config.points[0]?.zoom??1.1,points:[],sections:{home:'',features:'',download:''},segments:[],editableAnchors:true};}
export function appendAnchor(config:RouteConfig,point:RouteControl):RouteConfig {
  if(!config.editableAnchors&&config.points.length)throw Error('Существующие обязательные точки зафиксированы');
  const next=asFreehand(config);next.editableAnchors=true;next.points.push({...point,zoom:next.zoom??1.1,mandatory:true});
  if(next.points.length===1)for(const s of ['home','features','download'] as const)next.sections[s]=point.id;
  else {next.sections.download=point.id;if(next.points.length===3&&next.sections.features===next.points[0].id)next.sections.features=next.points[1].id;}
  return validateRoute(next);
}
export function controls(config:RouteConfig){return config.segments?.flatMap(s=>s.points)??[];}
export function assertAnchorsUnchanged(before:RouteConfig,after:RouteConfig){
  const anchors=(r:RouteConfig)=>r.points.map(p=>[p.id,p.x,p.y,p.zoom,p.mandatory]);
  if(JSON.stringify(anchors(before))!==JSON.stringify(anchors(after))||(['home','features','download'] as const).some(s=>before.sections[s]!==after.sections[s]))throw Error('Обязательные точки, их порядок и привязки защищены от изменений');
}
export function insertControl(config:RouteConfig,leg:number,index:number,point:RouteControl){
  const next=structuredClone(config),from=next.points[leg]?.id,to=next.points[leg+1]?.id;
  if(!from||!to)throw Error('Участок не существует');
  next.segments??=[];let segment=next.segments.find(s=>s.from===from&&s.to===to);
  if(!segment){segment={from,to,points:[]};next.segments.push(segment);}
  segment.points.splice(index,0,point);assertAnchorsUnchanged(config,next);return validateRoute(next);
}
export function moveControl(config:RouteConfig,id:string,x:number,y:number){
  const next=structuredClone(config),p=controls(next).find(p=>p.id===id);if(!p)throw Error('Обязательные точки зафиксированы');p.x=x;p.y=y;assertAnchorsUnchanged(config,next);return validateRoute(next);
}
export function removeControl(config:RouteConfig,id:string){
  const next=structuredClone(config),segment=next.segments?.find(s=>s.points.some(p=>p.id===id));if(!segment)throw Error('Можно удалять только корректирующие точки');segment.points=segment.points.filter(p=>p.id!==id);next.segments=next.segments?.filter(s=>s.points.length);assertAnchorsUnchanged(config,next);return validateRoute(next);
}
