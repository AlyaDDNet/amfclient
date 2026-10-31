import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
const b = readFileSync(process.argv[2]);
const n = o => b.readInt32LE(o);
const h = Array.from({length:8},(_,i)=>n(4+i*4));
const [version,size,swap,nt,ni,nd,is,ds] = h;
const io=36+nt*12, dOff=io+ni*4, dSize=dOff+nd*4, item= dSize+(version===4?nd*4:0), data=item+is;
function block(i){if(i<0)return null;const start=n(dOff+i*4),end=i+1<nd?n(dOff+(i+1)*4):ds;const raw=b.subarray(data+start,data+end);return version===4?inflateSync(raw):raw;}
function string(i){return block(i)?.toString('utf8').split('\0')[0];}
const types={};
for(let i=0;i<ni;i++){const p=item+n(io+i*4),t=b.readUInt32LE(p)>>>16,id=b.readUInt32LE(p)&65535,len=n(p+4);const a=Array.from({length:len/4},(_,j)=>n(p+8+j*4));(types[t]??=[]).push({id,a});}
if(process.argv.includes('--motion')){
 const name=(a)=>String.fromCharCode(...a.flatMap(v=>[24,16,8,0].map(s=>((v>>>s)&255)-128))).split('\0')[0];
 console.log(JSON.stringify({groups:types[4].map(({id,a})=>({id,name:name(a.slice(12)),parallax:a.slice(3,5)})),layers:types[5].map(({id,a})=>({id,type:a[1],name:name(a.slice(a[1]===2?15:7,a[1]===2?18:10)),quads:a[1]===3?Array.from({length:a[4]},(_,i)=>{const q=block(a[5]);const vals=Array.from({length:38},(_,j)=>q.readInt32LE(i*152+j*4));return {points:vals.slice(0,10).map(x=>x/1024),env:vals.slice(34)};}):undefined})),points:types[6],extended:types[65534],uuid:types[65535]},null,2));process.exit(0);
}
console.log(JSON.stringify({header:{magic:b.subarray(0,4).toString(),version,size,swap,nt,ni,nd,is,ds},types:Object.fromEntries(Object.entries(types).map(([k,v])=>[k,v.length])),info:types[1]?.map(({a})=>a.map((x,i)=>i?string(x):x)),images:types[2]?.map(({id,a})=>({id,a,name:string(a[4])})),groups:types[4],layers:types[5]?.map(({id,a})=>({id,a,bytes:a[1]===2?block(a[14])?.length:a[1]===3?block(a[5])?.length:0,nonzero:a[1]===2?Array.from(block(a[14])??[]).filter((v,i)=>i%4===0&&v!==0).length:undefined})),envelopes:types[3],envpointBytes:types[6]?.map(x=>x.a.length*4)},null,2));
