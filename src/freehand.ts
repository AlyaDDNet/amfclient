import {validateRoute,type RouteConfig,type RouteControl} from './route';
// Preserve user coordinates, IDs, section bindings and the order of every
// anchor/control. Only the old generated A* geometry is discarded.
export function asFreehand(config:RouteConfig):RouteConfig{
  const r=validateRoute(config);if(r.mode==='freehand')return r;
  const points=r.points.flatMap(p=>[p,...(r.segments?.find(s=>s.from===p.id)?.points??[]).map(c=>({...c,zoom:r.zoom??1.1}))]);
  return validateRoute({...r,mode:'freehand',editableAnchors:true,points,segments:[]});
}
// A single local convex filter: no overshoot, no global curve fitting. Endpoints stay exact.
export function smoothStroke(points:RouteControl[]):RouteControl[]{
  return points.map((p,i)=>!i||i===points.length-1?{...p}:{...p,x:(points[i-1].x+6*p.x+points[i+1].x)/8,y:(points[i-1].y+6*p.y+points[i+1].y)/8});
}
export function appendStroke(config:RouteConfig,stroke:RouteControl[]):RouteConfig{
  if(config.mode!=='freehand')throw Error('Сначала включите свободное рисование');
  const r=structuredClone(config),filtered=smoothStroke(stroke);
  for(const p of filtered){const last=r.points.at(-1);if(!last||Math.hypot(last.x-p.x,last.y-p.y)>=.01)r.points.push({...p,zoom:r.zoom??1.1});}
  for(const s of ['home','features','download'] as const)if(!r.sections[s])r.sections[s]=r.points[0]?.id??'';
  return validateRoute(r);
}
export class RouteHistory{
  private undoStack:RouteConfig[]=[];private redoStack:RouteConfig[]=[];
  get canUndo(){return this.undoStack.length>0;}get canRedo(){return this.redoStack.length>0;}
  push(r:RouteConfig){this.undoStack.push(structuredClone(r));if(this.undoStack.length>80)this.undoStack.shift();this.redoStack=[];}
  undo(current:RouteConfig){const r=this.undoStack.pop();if(r)this.redoStack.push(structuredClone(current));return r;}
  redo(current:RouteConfig){const r=this.redoStack.pop();if(r)this.undoStack.push(structuredClone(current));return r;}
}
export function deleteRange(config:RouteConfig,from:string,to:string){
  if(config.mode!=='freehand')throw Error('Только для нарисованного маршрута');
  const r=structuredClone(config),a=r.points.findIndex(p=>p.id===from),b=r.points.findIndex(p=>p.id===to);if(a<0||b<0)throw Error('Выберите начало и конец участка');
  r.points.splice(Math.min(a,b),Math.abs(b-a)+1);
  for(const s of ['home','features','download'] as const)if(!r.points.some(p=>p.id===r.sections[s]))r.sections[s]=r.points[0]?.id??'';
  return validateRoute(r);
}
