import type {MapModel} from './map/types';
import {GameplayNavigation} from './navigation';
import {TravelPath,type RouteConfig} from './route';
// Called only for initial authoring/reset by the developer script, never on
// load/save: explicit user constraints cannot be overwritten by auto generation.
export function createInitialRoute(model:MapModel,zoom=.5):RouteConfig {
  const find=(flag:number,index:number)=>{
    const points:{x:number;y:number}[]=[];
    for(const l of model.layers)if(l.kind==='tiles'&&(l.tileFlags&flag))for(let i=0;i<l.width*l.height;i++)if(l.tiles[i*4]===index)points.push({x:(i%l.width+.5)*32,y:(Math.floor(i/l.width)+.5)*32});
    if(!points.length)throw Error(`Нет native маркера ${index} в слое ${flag}`);
    return points[Math.floor((points.length-1)/2)];
  };
  const nav=new GameplayNavigation(model,zoom),spawn=find(1,192),start=find(8,33),finish=find(8,34);
  const path=new TravelPath(nav.path(start,finish),zoom),mid=path.at(path.length/2);
  return {version:1,zoom,points:[{id:'home',...spawn,zoom,mandatory:false},{id:'start-gate',...start,zoom,mandatory:false},{id:'features',x:mid.x,y:mid.y,zoom,mandatory:false},{id:'download',...finish,zoom,mandatory:false}],sections:{home:'home',features:'features',download:'download'}};
}
