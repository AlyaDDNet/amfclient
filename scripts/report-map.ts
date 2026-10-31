import { readFileSync } from 'node:fs';
import { parseMap } from '../src/map/parse';
const bytes=readFileSync(new URL('../public/maps/for-site.map',import.meta.url));
const map=parseMap(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
console.log(JSON.stringify({metadata:map.metadata,groups:map.groups,layers:map.layers.map(l=>({id:l.id,name:l.name,kind:l.kind,...(l.kind==='tiles'?{tileFlags:l.tileFlags,marks:l.marks.length,colorEnv:l.colorEnv}:{quads:l.quads.length,posEnvs:l.quads.map(q=>q.posEnv)})})),envelopes:map.envelopes,warnings:map.warnings},null,2));
