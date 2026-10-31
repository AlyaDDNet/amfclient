import {readFileSync} from 'node:fs';
import {parseMap} from '../src/map/parse';
import {GameplayNavigation} from '../src/navigation';
import {CameraRoute,TravelPath,validateRoute,type Section} from '../src/route';
const bytes=readFileSync('public/maps/for-site.map');
const model=parseMap(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
const config=validateRoute(JSON.parse(readFileSync('public/camera-route.json','utf8')));
const nav=new GameplayNavigation(model,config.zoom??config.points[0].zoom),route=new CameraRoute(config,nav);
const safe=route.geometry.every((p,i)=>!i||nav.visible(route.geometry[i-1],p));
if(!safe)throw Error('Unsafe generated segment');
const sections:Section[]=['home','features','download'];
console.log(JSON.stringify({mandatory:config.points.filter(p=>p.mandatory).length,zoom:route.zoom,length:route.length,vertices:route.geometry.length,collisionSafe:safe,
  legs:config.points.slice(1).map((p,i)=>({from:config.points[i].id,to:p.id,length:route.pointDistances[i+1]-route.pointDistances[i]})),
  transfers:sections.flatMap((a,i)=>sections.slice(i+1).map(b=>({from:a,to:b,mainLength:Math.abs(route.section(b)-route.section(a)),shortcutLength:new TravelPath(nav.path(route.at(route.section(a)),route.at(route.section(b))),route.zoom).length})))},null,2));
