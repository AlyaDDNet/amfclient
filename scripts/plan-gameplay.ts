import {readFileSync} from 'node:fs';
import {parseMap} from '../src/map/parse';
import {GameplayNavigation} from '../src/navigation';
import {CameraRoute} from '../src/route';
import {createInitialRoute} from '../src/initial-route';
const b=readFileSync('public/maps/for-site.map'),model=parseMap(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));
const nav=new GameplayNavigation(model,.5),config=createInitialRoute(model);
const route=new CameraRoute(config,nav);
console.log(JSON.stringify({config,length:route.length,vertices:route.geometry.length},null,2));
