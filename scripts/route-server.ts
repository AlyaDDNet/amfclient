import type { Plugin } from 'vite';
import { writeFile, rename, readFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { validateRoute, CameraRoute } from '../src/route';
import { GameplayNavigation } from '../src/navigation';
import { parseMap } from '../src/map/parse';
import { assertAnchorsUnchanged } from '../src/route-edit';
import {validateContent} from '../src/site-content';
import {mainPoints} from '../src/site-navigation';
export function localRouteEditor():Plugin {
  return {name:'amf-local-route-editor',apply:'serve',configureServer(server){
    const backupDirectory=resolve(server.config.root,'artifacts/route-backups');
    server.middlewares.use('/__dev/site-content',(req,res)=>{
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'')||req.headers.origin!==`http://${req.headers.host}`){res.statusCode=403;res.end('Local same-origin only');return;}
      if(req.method!=='POST'){res.statusCode=405;res.end('POST only');return;}
      if(!(req.headers['content-type']??'').startsWith('application/json')){res.statusCode=415;res.end('JSON only');return;}
      let body='',oversized=false;req.on('data',chunk=>{if(oversized)return;body+=chunk;if(Buffer.byteLength(body)>1024*1024){oversized=true;res.statusCode=413;res.end('Content exceeds 1 MiB');}});
      req.on('end',()=>{if(oversized)return;void(async()=>{try{
        const content=validateContent(JSON.parse(body)),target=resolve(server.config.root,'public/site-sections.json'),previous=await readFile(target,'utf8');
        const config=validateRoute(JSON.parse(await readFile(resolve(server.config.root,'public/camera-route.json'),'utf8'))),points=mainPoints(config);
        if(content.sections.length!==points.length||content.sections.some((s,i)=>s.pointId!==points[i].id))throw Error('Каждый раздел должен соответствовать основной точке в порядке окончательного маршрута');
        if(content.sections.some(s=>s.actions.some(a=>a.sectionId&&!content.sections.some(t=>t.id===a.sectionId))))throw Error('Кнопка ссылается на отсутствующий раздел');
        if(req.headers['x-amf-content-version']!==createHash('sha256').update(JSON.stringify(validateContent(JSON.parse(previous)))).digest('hex')){res.statusCode=409;res.end('Тексты изменены в другой вкладке; перезагрузите редактор.');return;}
        const directory=resolve(server.config.root,'artifacts/content-backups');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,`content-${Date.now()}-${randomUUID()}.json`),previous,{flag:'wx'});
        const temp=`${target}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(content,null,2)+'\n',{flag:'wx'});await rename(temp,target);res.end('{"saved":true}');
      }catch(e){res.statusCode=400;res.end((e as Error).message);}})();});
    });
    server.middlewares.use('/__dev/site-layout-backups',(req,res)=>{
      const address=req.socket.remoteAddress??'';
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)||(req.headers.origin!==undefined&&req.headers.origin!==`http://${req.headers.host}`)){res.statusCode=403;res.end('Local same-origin only');return;}
      const directory=resolve(server.config.root,'artifacts/content-backups');
      if(req.method==='GET'){
        void(async()=>{try{const names=(await readdir(directory)).filter(name=>/^content-\d+-[0-9a-f-]+\.json$/i.test(name)).sort().reverse();const backups=await Promise.all(names.slice(0,50).map(async name=>({name,modified:(await stat(resolve(directory,name))).mtime.toISOString()})));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({backups}));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'){res.setHeader('Content-Type','application/json');res.end('{"backups":[]}');return;}res.statusCode=500;res.end((e as Error).message);}})();return;
      }
      if(req.method!=='POST'){res.statusCode=405;res.end('GET / POST only');return;}
      if(req.headers.origin!==`http://${req.headers.host}`){res.statusCode=403;res.end('Same-origin only');return;}
      if(!(req.headers['content-type']??'').startsWith('application/json')){res.statusCode=415;res.end('JSON only');return;}
      let body='',oversized=false;req.on('data',chunk=>{if(oversized)return;body+=chunk;if(Buffer.byteLength(body)>1024*1024){oversized=true;res.statusCode=413;res.end('Content exceeds 1 MiB');}});
      req.on('end',()=>{if(oversized)return;void(async()=>{try{
        const request=JSON.parse(body) as {name?:unknown};if(typeof request.name!=='string'||!/^content-\d+-[0-9a-f-]+\.json$/i.test(request.name))throw Error('Некорректное имя резервной копии');
        const content=validateContent(JSON.parse(await readFile(resolve(directory,request.name),'utf8'))),target=resolve(server.config.root,'public/site-sections.json'),previous=await readFile(target,'utf8');
        const route=validateRoute(JSON.parse(await readFile(resolve(server.config.root,'public/camera-route.json'),'utf8'))),points=mainPoints(route);
        if(content.sections.length!==points.length||content.sections.some((section,index)=>section.pointId!==points[index].id))throw Error('Резервная копия относится к другой структуре точек');
        await mkdir(directory,{recursive:true});await writeFile(resolve(directory,`content-${Date.now()}-${randomUUID()}.json`),previous,{flag:'wx'});
        const temp=`${target}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(content,null,2)+'\n',{flag:'wx'});await rename(temp,target);
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify(content));
      }catch(e){res.statusCode=400;res.end((e as Error).message);}})();});
    });
    const backup=async(config:unknown)=>{const r=validateRoute(config);await mkdir(backupDirectory,{recursive:true});const name=`route-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}.json`;await writeFile(resolve(backupDirectory,name),JSON.stringify(r,null,2)+'\n',{flag:'wx'});return name;};
    server.middlewares.use('/__dev/route-backup',(req,res)=>{
      const address=req.socket.remoteAddress??'';
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)){res.statusCode=403;res.end('Local only');return;}
      if(req.method==='GET'){
        void (async()=>{try{const files=(await readdir(backupDirectory)).filter(n=>/^route-[0-9TZ-]+-[0-9a-f-]+\.json$/i.test(n)).sort();const name=files.at(-1);if(!name)throw Error('Резервных копий пока нет');const config=validateRoute(JSON.parse(await readFile(resolve(backupDirectory,name),'utf8')));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name,config}));}catch(e){res.statusCode=404;res.end((e as Error).message);}})();return;
      }
      if(req.method!=='POST'){res.statusCode=405;res.end('GET / POST only');return;}
      if(req.headers.origin!==`http://${req.headers.host}`){res.statusCode=403;res.end('Same-origin only');return;}
      let body='',oversized=false;req.on('data',chunk=>{if(oversized)return;body+=chunk;if(Buffer.byteLength(body)>8*1024*1024){oversized=true;res.statusCode=413;res.end('Route exceeds 8 MiB');}});
      req.on('end',()=>{if(oversized)return;void(async()=>{try{const name=await backup(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name}));}catch(e){res.statusCode=400;res.end((e as Error).message);}})();});
    });
    server.middlewares.use('/__dev/route',(req,res)=>{
      const reject=(status:number,message:string)=>{res.statusCode=status;res.end(message);};
      const address=req.socket.remoteAddress??'';
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address))return reject(403,'Local requests only');
      if(req.method!=='POST')return reject(405,'POST only');
      if(req.headers.origin!==`http://${req.headers.host}`)return reject(403,'Same-origin requests only');
      if(!(req.headers['content-type']??'').startsWith('application/json'))return reject(415,'JSON only');
      let body='',oversized=false;
      req.on('data',chunk=>{if(oversized)return;body+=chunk;if(Buffer.byteLength(body)>8*1024*1024){oversized=true;reject(413,'Route exceeds 8 MiB');}});
      req.on('end',()=>{if(oversized)return;void (async()=>{try{
        const route=validateRoute(JSON.parse(body));
        const target=resolve(server.config.root,'public/camera-route.json');
        const current=validateRoute(JSON.parse(await readFile(target,'utf8')));
        let replaces=false;try{assertAnchorsUnchanged(current,route);}catch(e){if(req.headers['x-amf-route-replace']!=='confirmed')throw e;replaces=true;}
        if((current.zoom??current.points[0]?.zoom??1.1)!==(route.zoom??route.points[0]?.zoom??1.1))throw Error('Постоянный масштаб защищён от изменения');
        const data=await readFile(resolve(server.config.root,'public/maps/for-site.map'));
        const model=parseMap(data.buffer.slice(data.byteOffset,data.byteOffset+data.length));
        new CameraRoute(route,new GameplayNavigation(model,route.zoom??route.points[0]?.zoom??1.1));
        const latest=validateRoute(JSON.parse(await readFile(target,'utf8')));
        const fingerprint=createHash('sha256').update(JSON.stringify(latest)).digest('hex');
        if(req.headers['x-amf-route-version']!==fingerprint)return reject(409,'Маршрут изменён в другой вкладке. Экспортируйте свой черновик и откройте актуальный JSON. Ничего не перезаписано.');
        // Every successful replacement is recoverable, including edits to a drawn line.
        await backup(latest);
        const temp=`${target}.${randomUUID()}.tmp`;
        await writeFile(temp,JSON.stringify(route,null,2)+'\n',{flag:'wx'});await rename(temp,target);
        res.setHeader('Content-Type','application/json');res.end('{"saved":true}');
      }catch(e){reject(400,e instanceof Error?e.message:String(e));}})();});
    });
  }};
}
