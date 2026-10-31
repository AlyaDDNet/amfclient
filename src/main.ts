import './style.css';
import type { MapModel } from './map/types';
import { MapRenderer, cameraWithVerticalOffset, findForegroundLayerStart, type Camera } from './map/renderer';
import { CameraRoute, validateRoute, type Section, type RouteConfig } from './route';
import {SiteFollower,entitiesShortcut} from './site-navigation';
import {resolveSections,validateContent,type SiteContent,type SiteSection} from './site-content';
import {applyElementLayout,applyWorldProjection,currentBreakpoint,elementLayout,worldTransform} from './site-layout';
import {groupView,GAME_GROUP} from './map/renderer';
import type { RouteEditor } from './editor';
import { GameplayNavigation } from './navigation';
import { applyTranslations, currentLocale, localeCode, sectionLabel, setLocale, translate, type Locale } from './i18n';
import { AMF_DOWNLOAD, downloadHref } from './download-config';
const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const canvas=$<HTMLCanvasElement>('#map'),foregroundCanvas=$<HTMLCanvasElement>('#map-foreground'),overlay=$<HTMLCanvasElement>('#overlay'),ctx=overlay.getContext('2d')!;
const load=$('#load'),detail=$('#load-detail');
const base=import.meta.env.BASE_URL;
let renderer:MapRenderer|undefined,foregroundRenderer:MapRenderer|undefined,foregroundLayerStart=0,rendererRestoring=false,model:MapModel,editor:RouteEditor|undefined;
let contentEditor:{update():void;dispose():void}|undefined;
let route:CameraRoute,follower:SiteFollower,camera:Camera={x:0,y:0,zoom:1};
let contentConfig:SiteContent={version:1,sections:[]},siteSections:SiteSection[]=[];
let navigation:GameplayNavigation;
let navHighlight:HTMLSpanElement|undefined,navObserver:ResizeObserver|undefined,navHighlightReady=false;
let entities=false,raf=0,last=performance.now(),clockStart=performance.now(),activeSection='',disposed=false;
let entityImage:HTMLImageElement,speedArrowImage:HTMLImageElement,worker:Worker|undefined;
const removers:(()=>void)[]=[];
function on(target:EventTarget,name:string,fn:EventListener,options?:AddEventListenerOptions){target.addEventListener(name,fn,options);removers.push(()=>target.removeEventListener(name,fn,options));}
function localizeText(element:HTMLElement,value:string){
  const key=value.startsWith('i18n:')?value.slice(5):'';
  if(key){element.dataset.i18n=key;element.textContent=translate(key);}else{delete element.dataset.i18n;element.textContent=value;}
}
function refreshLocalization(){
  applyTranslations();
  const trigger=$<HTMLButtonElement>('#language-trigger'),menu=$<HTMLDivElement>('#language-menu');
  $('#language-code').textContent=localeCode();
  trigger.setAttribute('aria-label',translate('language.choose'));
  for(const option of menu.querySelectorAll<HTMLButtonElement>('[data-locale]'))option.setAttribute('aria-selected',String(option.dataset.locale===currentLocale()));
  const nav=$('header nav');nav.setAttribute('aria-label',translate('nav.siteSections'));
  for(const button of nav.querySelectorAll<HTMLButtonElement>('[data-section]')){
    button.textContent=sectionLabel(button.dataset.section??'');
    button.setAttribute('aria-current',(button.dataset.section===(activeSection||siteSections[0]?.id))?'page':'false');
  }
  for(const panel of document.querySelectorAll<HTMLElement>('#world-space>[data-panel]'))panel.setAttribute('aria-label',sectionLabel(panel.dataset.panel??''));
  const active=siteSections.find(section=>section.id===activeSection)??siteSections[0];
  if(active)$('#section-label').textContent=sectionLabel(active.id,active.label).toLocaleUpperCase(currentLocale());
  placeNavHighlight(activeSection||siteSections[0]?.id||'');
  document.dispatchEvent(new Event('amf-locale-change'));
}
function initLanguagePicker(){
  const trigger=$<HTMLButtonElement>('#language-trigger'),menu=$<HTMLDivElement>('#language-menu');
  const close=()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');};
  on(trigger,'click',()=>{const open=menu.hidden;menu.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open)menu.querySelector<HTMLButtonElement>(`[data-locale="${currentLocale()}"]`)?.focus();});
  on(menu,'click',event=>{const option=(event.target as Element).closest<HTMLButtonElement>('[data-locale]');if(!option)return;setLocale(option.dataset.locale as Locale);refreshLocalization();close();trigger.focus();});
  on(document,'pointerdown',event=>{if(!(event.target as Element).closest('.language-switcher'))close();});
  on(document,'keydown',event=>{if((event as KeyboardEvent).key==='Escape'&&!menu.hidden){close();trigger.focus();}});
}
function image(url:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error(`Не удалось загрузить ресурс: ${url}`));i.src=url;});}
async function loadMap(){
  const response=await fetch(`${base}maps/for-site.map`);if(!response.ok)throw new Error(`Карта: HTTP ${response.status}`);
  const bytes=await response.arrayBuffer();
  return new Promise<MapModel>((resolve,reject)=>{
    worker=new Worker(new URL('./map/worker.ts',import.meta.url),{type:'module'});
    worker.onerror=()=>{worker?.terminate();worker=undefined;reject(new Error('Ошибка map worker'));};
    worker.onmessage=e=>{worker?.terminate();worker=undefined;e.data.ok?resolve(e.data.model):reject(new Error(e.data.error));};
    worker.postMessage(bytes,[bytes]);
  });
}
function toggleEntities(){entities=!entities;$('#entities').setAttribute('aria-pressed',String(entities));document.body.dataset.entities=String(entities);}
function createRenderers(){
  const nextBackground=new MapRenderer(canvas,model,entityImage,speedArrowImage,{layerStart:0,layerEnd:foregroundLayerStart});
  let nextForeground:MapRenderer|undefined;
  try{
    if(foregroundLayerStart<model.layers.length)nextForeground=new MapRenderer(foregroundCanvas,model,entityImage,speedArrowImage,{layerStart:foregroundLayerStart,layerEnd:model.layers.length,alpha:true,shade:true});
  }catch(error){nextBackground.dispose();throw error;}
  renderer?.dispose();foregroundRenderer?.dispose();renderer=nextBackground;foregroundRenderer=nextForeground;
}
function replaceRoute(config:RouteConfig){
  const next=new CameraRoute(config,navigation);
  const old=follower.route.length?follower.distance/follower.route.length:0;route=next;follower=new SiteFollower(route);follower.seek(old*route.length);buildSections();
}
function pointForSection(section:SiteSection){return route.config.points.find(p=>p.id===section.pointId)??route.config.points[0]??{x:0,y:0};}
function applySiteLayouts(){
  const breakpoint=currentBreakpoint();
  for(const el of document.querySelectorAll<HTMLElement>('#world-space [data-layout-id]')){
    const panel=el.closest<HTMLElement>('[data-panel]');
    const section=siteSections.find(s=>s.id===(el.dataset.layoutSection??panel?.dataset.panel));
    if(!section)continue;
    const role=el.dataset.layoutRole??'description',index=Number(el.dataset.layoutIndex??0),count=role==='card'?section.cards.length:role==='action'?section.actions.length:role.startsWith('custom-')?(section.layoutItems?.length??1):1;
    el.dataset.layoutRemoved=String(section.layoutRemoved?.includes(el.dataset.layoutId!)??false);
    applyElementLayout(el,elementLayout(section,el.dataset.layoutId!,role,index,count,breakpoint,pointForSection(section)),breakpoint);
  }
}
function placeNavHighlight(sectionId=activeSection){
  const nav=document.querySelector<HTMLElement>('header nav'),button=nav?.querySelector<HTMLElement>(`[data-section="${CSS.escape(sectionId)}"]`);
  if(!nav||!button||!navHighlight)return;
  navHighlight.style.width=`${button.offsetWidth}px`;navHighlight.style.height=`${button.offsetHeight}px`;
  navHighlight.style.transform=`translate3d(${button.offsetLeft}px,${button.offsetTop}px,0)`;
  if(!navHighlightReady){requestAnimationFrame(()=>{navHighlightReady=true;navHighlight?.classList.add('is-ready');});}
}
function actionIcon(kind:'download'|'github'){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',kind==='download'?'M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3':'M12 .8a11.2 11.2 0 0 0-3.54 21.82c.56.1.76-.24.76-.54v-2.1c-3.1.67-3.76-1.31-3.76-1.31-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 .1.75 1.76 3.02 1.19.1-.72.39-1.2.7-1.48-2.48-.28-5.08-1.24-5.08-5.52 0-1.22.44-2.22 1.16-3-.12-.29-.5-1.42.11-2.96 0 0 .95-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.62 1.54.23 2.67.12 2.96.72.78 1.15 1.78 1.15 3 0 4.29-2.6 5.23-5.09 5.5.4.35.75 1.02.75 2.06v3.05c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z');
  svg.append(path);return svg;
}
function projectWorldContent(renderCamera:Camera,width:number,height:number){
  const view=groupView(renderCamera,width/Math.max(1,height),GAME_GROUP),world=$<HTMLDivElement>('#world-space');
  const projection=worldTransform(view,width,height);
  world.dataset.worldTransform=projection;
  world.style.transform='none';
  for(const element of world.querySelectorAll<HTMLElement>('[data-layout-id]'))applyWorldProjection(element,view,width,height);
}
function buildSections(){
  siteSections=resolveSections(route.config,contentConfig);const nav=$('header nav'),content=$<HTMLDivElement>('#world-space');navObserver?.disconnect();nav.replaceChildren();content.replaceChildren();activeSection='';navHighlightReady=false;
  navHighlight=document.createElement('span');navHighlight.className='nav-highlight';navHighlight.setAttribute('aria-hidden','true');nav.append(navHighlight);
  for(const s of siteSections){const b=document.createElement('button');b.dataset.section=s.id;b.dataset.i18n=`nav.${s.id}`;b.textContent=sectionLabel(s.id,s.label);b.setAttribute('aria-current',s.id===siteSections[0]?.id?'page':'false');nav.append(b);
    const panel=document.createElement('section');panel.className='section-panel nova-panel';panel.dataset.panel=s.id;panel.setAttribute('aria-label',sectionLabel(s.id,s.label));panel.setAttribute('role','group');
    const layoutElement=(el:HTMLElement,id:string,role:string,index=0,count=1)=>{el.dataset.layoutId=id;el.dataset.layoutRole=role;el.dataset.layoutIndex=String(index);el.dataset.layoutSection=s.id;};
    const authoredFrame=s.layoutRemoved?.includes('nova-panel')?s.layoutItems?.find(item=>item.type==='panel'&&!s.layoutRemoved?.includes(item.id)):undefined;
    const frameIndex=authoredFrame?s.layoutItems!.indexOf(authoredFrame):0;
    layoutElement(panel,authoredFrame?.id??'nova-panel',authoredFrame?'custom-panel':'panel',frameIndex,authoredFrame?s.layoutItems!.length:1);
    if(authoredFrame)panel.dataset.layoutCustom='true';
    if(s.eyebrow||s.title||s.accent||s.subtitle||s.description){
      const headingGroup=document.createElement('div');headingGroup.className='panel-heading';headingGroup.setAttribute('role','group');
      if(s.eyebrow){const eyebrow=document.createElement('p');eyebrow.className='eyebrow';localizeText(eyebrow,s.eyebrow);layoutElement(eyebrow,'eyebrow','eyebrow');headingGroup.append(eyebrow);}
      if(s.title||s.accent){const title=document.createElement(s.id==='home'?'h1':'h2'),text=document.createElement('span'),accent=document.createElement('em');localizeText(text,s.title);localizeText(accent,s.accent);title.append(text);if(s.accent)title.append(document.createTextNode(s.title?' ':''),accent);layoutElement(title,'title','title');headingGroup.append(title);}
      if(s.subtitle){const sub=document.createElement('p');sub.className='hero-subtitle';localizeText(sub,s.subtitle);layoutElement(sub,'subtitle','subtitle');headingGroup.append(sub);}
      if(s.description){const description=document.createElement('p');description.className=s.id==='home'?'hero-description':'intro';localizeText(description,s.description);layoutElement(description,'description','description');headingGroup.append(description);}
      panel.append(headingGroup);
    }
    const cards=document.createElement('div');cards.className='feature-list';cards.setAttribute('role','list');cards.setAttribute('aria-label',`${sectionLabel(s.id,s.label)}: ${translate('nav.features').toLocaleLowerCase(currentLocale())}`);s.cards.forEach((card,i)=>{const article=document.createElement('article'),n=document.createElement('span'),body=document.createElement('div'),h=document.createElement('h3'),p=document.createElement('p');article.setAttribute('role','listitem');n.textContent=String(i+1).padStart(2,'0');localizeText(h,card.title);localizeText(p,card.text);body.append(h,p);article.append(n,body);layoutElement(article,`card-${i}`,'card',i,s.cards.length);cards.append(article);});if(s.cards.length)panel.append(cards);
    const actions=document.createElement('div');actions.className='actions';actions.setAttribute('role','group');actions.setAttribute('aria-label',`${sectionLabel(s.id,s.label)}: ${translate('language.choose').toLocaleLowerCase(currentLocale())}`);s.actions.forEach((a,i)=>{const href=a.download?downloadHref():a.href;const el=document.createElement(href?'a':'button');const isDownload=s.id==='download'&&a.download===true,isGithub=s.id==='download'&&href===AMF_DOWNLOAD.releaseUrl;el.className=isDownload?'primary download-primary':isGithub?'secondary github-secondary':i?'secondary':'primary';const label=document.createElement('span');label.className='action-label';localizeText(label,a.label);el.append(label);if(isDownload)el.append(actionIcon('download'));if(isGithub)el.append(actionIcon('github'));if(el instanceof HTMLAnchorElement){el.href=href!;if(a.download){el.download='';el.dataset.directDownload='true';}else{el.target='_blank';el.rel='noopener noreferrer';}}else el.dataset.section=a.sectionId??s.id;layoutElement(el,`action-${i}`,'action',i,s.actions.length);actions.append(el);});if(s.actions.length)panel.append(actions);
    for(const item of s.layoutItems??[]){
      if(item.id===authoredFrame?.id)continue;
      let element:HTMLElement;
      if(item.type==='logo'){
        const wordmark=document.createElement('div');wordmark.className='amf-worldmark';wordmark.setAttribute('role','group');wordmark.setAttribute('aria-label',item.text?`${item.title}. ${item.text}`:item.title);
        const title=document.createElement('h1');title.className='amf-worldmark-title';
        const amf=document.createElement('span'),space=document.createElement('span'),client=document.createElement('span');
        amf.className='amf-worldmark-amf';amf.textContent='AMF';space.className='amf-worldmark-space';space.textContent=' ';client.className='amf-worldmark-client';client.textContent='Client';
        title.append(amf,space,client);const tagline=document.createElement('p');tagline.className='amf-worldmark-subtitle';tagline.textContent=item.text;element=wordmark;wordmark.append(title,tagline);
        element.className=`layout-custom layout-custom-logo amf-worldmark`;
        layoutElement(element,item.id,'custom-logo',s.layoutItems!.indexOf(item),s.layoutItems!.length);element.dataset.layoutCustom='true';
        content.append(element);
        continue;
      }
      if(item.type==='button'&&item.href){const a=document.createElement('a');a.href=item.href;a.target='_blank';a.rel='noopener noreferrer';element=a;}
      else if(item.type==='button'&&item.sectionId){const button=document.createElement('button');button.dataset.section=item.sectionId;element=button;}
      else if(item.type==='button'){const button=document.createElement('button');button.type='button';element=button;}
      else element=document.createElement(item.type==='card'||item.type==='panel'?'article':'div');
      element.className=`layout-custom layout-custom-${item.type}`;
      if(item.type==='button')localizeText(element,item.title);
      else if(item.type!=='panel'){const h=document.createElement('h3');localizeText(h,item.title);const p=document.createElement('p');localizeText(p,item.text);element.append(h,p);}
      layoutElement(element,item.id,`custom-${item.type}`,s.layoutItems!.indexOf(item),s.layoutItems!.length);element.dataset.layoutCustom='true';
      if(item.type==='panel'){element.setAttribute('aria-label',translate('panel.emptyFrame'));content.append(element);}else panel.append(element);
    }
    const sourceElements=new Map([...panel.querySelectorAll<HTMLElement>('[data-layout-id]')].map(el=>[el.dataset.layoutId!,el]));
    for(const extra of s.layoutExtras??[]){const source=sourceElements.get(extra.sourceId);if(!source)continue;const clone=source.cloneNode(true) as HTMLElement;clone.dataset.layoutId=extra.id;clone.dataset.layoutSection=s.id;clone.dataset.layoutExtra='true';clone.dataset.layoutExtraSource=extra.sourceId;if(extra.title!==undefined){const h=clone.matches('h1,h2,h3')?clone:clone.querySelector('h3');if(h)h.textContent=extra.title;}if(extra.text!==undefined){const p=clone.querySelector('p');if(p)p.textContent=extra.text;}if(extra.label!==undefined){const label=clone.querySelector('.action-label');if(label)label.textContent=extra.label;else clone.textContent=extra.label;}if(extra.href!==undefined&&clone instanceof HTMLAnchorElement)clone.href=extra.href;panel.append(clone);sourceElements.set(extra.id,clone);}
    content.append(panel);
  }
  applySiteLayouts();refreshLocalization();placeNavHighlight(siteSections[0]?.id??'');
  navObserver=new ResizeObserver(()=>placeNavHighlight());navObserver.observe(nav);
  void document.fonts?.ready.then(()=>placeNavHighlight());
}
function navigate(section:string){if(!follower)return;const s=siteSections.find(s=>s.id===section);if(!s)return;editor?.navigate('home');if(!editor?.editing)follower.goToPoint(s.pointId);}
function wheel(event:WheelEvent){
  if((event.target as Element).closest(import.meta.env.DEV?'#route-editor,#content-layout-editor,#layout-selection-overlay,#diagnostics':'#diagnostics'))return;
  const panel=$('#content');
  if((event.target as Element).closest('#content')&&panel.scrollHeight>panel.clientHeight){
    const canScroll=event.deltaY<0?panel.scrollTop>0:panel.scrollTop+panel.clientHeight<panel.scrollHeight-1;
    if(canScroll)return;
  }
  event.preventDefault();
  if(editor?.handleWheel(event))return;
  const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
  follower.scroll(Math.max(-500,Math.min(500,pixels))*1.4);
}
function key(event:KeyboardEvent){
  const editingText=!!(event.target as Element)?.closest('input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]');
  if(entitiesShortcut(event,editingText)&&!event.isComposing){event.preventDefault();toggleEntities();return;}
  if(editingText)return;
  if(editor?.editing)return;
  const dir=['ArrowDown','ArrowRight','PageDown'].includes(event.key)?1:['ArrowUp','ArrowLeft','PageUp'].includes(event.key)?-1:0;
  if(dir){event.preventDefault();follower.scroll(dir*(event.key.startsWith('Page')?500:160));}
  if(event.key==='Home'){event.preventDefault();if(siteSections[0])follower.goToPoint(siteSections[0].pointId);}
  if(event.key==='End'){event.preventDefault();if(siteSections.at(-1))follower.goToPoint(siteSections.at(-1)!.pointId);}
}
function updateContent(){
  if(!siteSections.length)return;
  const position=(s:SiteSection)=>route.pointDistances[route.config.points.findIndex(p=>p.id===s.pointId)]??0;
  const selectionDistance=follower.transitioning?follower.target:follower.distance;
  const section=siteSections.reduce((a,b)=>Math.abs(position(b)-selectionDistance)<Math.abs(position(a)-selectionDistance)?b:a);
  if(section.id!==activeSection){activeSection=section.id;for(const b of document.querySelectorAll('header nav [data-section]'))b.setAttribute('aria-current',b.getAttribute('data-section')===section.id?'page':'false');placeNavHighlight(section.id);}
  const percentage=route.length?Math.round(follower.distance/route.length*100):0;
  $('#route-progress').style.transform=`scaleX(${percentage/100})`;
  $('#route-percent').textContent=`${percentage}%`;
  $('#section-label').textContent=sectionLabel(section.id,section.label).toLocaleUpperCase(currentLocale());
}
let reportAt=0;
function frame(now:number){
  if(disposed||document.hidden||!renderer)return;
  const dt=Math.min((now-last)/1000,0.1);last=now;
  camera=editor?.editing?editor.camera:follower.advance(dt,now);
  const aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight),renderCamera=editor?.editing?camera:cameraWithVerticalOffset(camera,aspect);
  const time=now-clockStart;renderer.draw(renderCamera,time,entities);foregroundRenderer?.draw(renderCamera,time,entities);projectWorldContent(renderCamera,canvas.clientWidth,canvas.clientHeight);
  contentEditor?.update();
  const dpr=Math.min(devicePixelRatio||1,2),w=innerWidth,h=innerHeight;
  if(overlay.width!==Math.round(w*dpr)||overlay.height!==Math.round(h*dpr)){overlay.width=Math.round(w*dpr);overlay.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  if(entities)renderer.drawEntityLabels(ctx,renderCamera);
  editor?.draw(ctx,route,camera);
  if(!editor?.editing)updateContent();
  // Read-only QA telemetry, throttled to avoid layout work every frame.
  if(now-reportAt>250){
    reportAt=now;
    const drawCalls=renderer.stats.drawCalls+(foregroundRenderer?.stats.drawCalls??0),triangles=renderer.stats.triangles+(foregroundRenderer?.stats.triangles??0),cpuMs=renderer.stats.cpuMs+(foregroundRenderer?.stats.cpuMs??0);
    Object.assign(canvas.dataset,{cameraX:camera.x.toFixed(2),cameraY:camera.y.toFixed(2),cameraZoom:camera.zoom.toFixed(3),routeDistance:follower.distance.toFixed(2),routeTarget:follower.target.toFixed(2),navigationMs:String(follower.lastDuration),transitioning:String(follower.transitioning),animationMs:time.toFixed(0),drawCalls:String(drawCalls),foregroundLayerStart:String(foregroundLayerStart),entities:String(entities)});
    if($('#diagnostics').hasAttribute('open'))$('#map-report').textContent=report()+`\nDraw calls: ${drawCalls}\nTriangles: ${triangles}\nCPU submit: ${cpuMs.toFixed(2)} ms\nForeground starts at layer ${foregroundLayerStart}`;
  }
  raf=requestAnimationFrame(frame);
}
function report(){const m=model.metadata;return `For Site.map · DATA v${model.version}\n${m.sourceBytes.toLocaleString()} bytes · ${m.gameWidth} × ${m.gameHeight} tiles\n${model.groups.length} groups · ${model.layers.length} layers\n${model.images.length} embedded images · ${m.quads} quads\n${m.tiles} non-empty tiles (all layers)\n${model.envelopes.length} envelopes · ${m.animatedQuads} animated quads\n${m.colorBindings} color-envelope bindings\n${model.warnings.length?'Warnings:\n'+model.warnings.join('\n'):'No unsupported items in this map'}\nClock: independent of camera\nN: real game / front / tele / tune / speedup layers`;} 
function restartFrame(){cancelAnimationFrame(raf);last=performance.now();if(!document.hidden)raf=requestAnimationFrame(frame);}
async function start(){
  [model,entityImage,speedArrowImage]=await Promise.all([loadMap(),image(`${base}assets/ddnet-entities.png`),image(`${base}assets/ddnet-speed-arrow.png`)]);
  foregroundLayerStart=findForegroundLayerStart(model);
  for(const item of model.images.filter(i=>i.external)){
    if(item.name.includes('..')||/[\\/]/.test(item.name))throw new Error('Небезопасное имя внешнего mapres');
    const img=await image(`${base}mapres/${encodeURIComponent(item.name)}.png`),c=document.createElement('canvas');
    c.width=img.width;c.height=img.height;c.getContext('2d')!.drawImage(img,0,0);
    item.width=img.width;item.height=img.height;item.pixels=new Uint8Array(c.getContext('2d')!.getImageData(0,0,img.width,img.height).data);
  }
  const response=await fetch(`${base}camera-route.json`);if(!response.ok)throw new Error(`Маршрут: HTTP ${response.status}`);
  const savedConfig=validateRoute(await response.json());let config=savedConfig;
  const contentResponse=await fetch(`${base}site-sections.json`);if(!contentResponse.ok)throw Error('Не удалось загрузить разделы сайта');contentConfig=validateContent(await contentResponse.json());
  if(import.meta.env.DEV&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('editor')==='1'){
    const {prepareEditorRoute}=await import('./editor');config=await prepareEditorRoute(savedConfig);
  }
  navigation=new GameplayNavigation(model,config.zoom??config.points[0]?.zoom??1.1);
  route=new CameraRoute(config,navigation);follower=new SiteFollower(route);buildSections();
  follower.distance=follower.target=route.section('home');camera=route.at(follower.distance);
  createRenderers();
  $('#map-report').textContent=report();
  on(window,'wheel',wheel as EventListener,{passive:false});on(window,'keydown',key as EventListener);
  on(window,'resize',()=>{applySiteLayouts();placeNavHighlight();});
  on(document,'click',e=>{const target=e.target as Element;if(document.body.classList.contains('layout-edit-mode')&&target.closest('#world-space')){e.preventDefault();return;}const button=target?.closest<HTMLElement>('[data-section]');if(button){e.preventDefault();navigate(button.dataset.section!);}});
  on($('#entities'),'click',toggleEntities);
  let touchY:number|undefined;
  on(canvas,'pointerdown',((e:PointerEvent)=>{if(e.pointerType==='touch'&&!editor?.editing){touchY=e.clientY;canvas.setPointerCapture(e.pointerId);}}) as EventListener);
  on(canvas,'pointermove',((e:PointerEvent)=>{if(touchY!==undefined){follower.scroll((touchY-e.clientY)*2);touchY=e.clientY;}}) as EventListener);
  const endTouch=()=>{touchY=undefined;};on(canvas,'pointerup',endTouch);on(canvas,'pointercancel',endTouch);
  on(document,'visibilitychange',restartFrame);on(window,'pageshow',restartFrame);on(window,'pagehide',()=>cancelAnimationFrame(raf));
  const contextLost=(event:Event)=>{event.preventDefault();cancelAnimationFrame(raf);load.hidden=false;detail.textContent='WebGL context потерян. Ожидаем восстановления…';};
  const contextRestored=()=>{if(rendererRestoring)return;rendererRestoring=true;requestAnimationFrame(()=>{try{createRenderers();load.hidden=true;restartFrame();}catch(error){showError(error);}finally{rendererRestoring=false;}});};
  on(canvas,'webglcontextlost',contextLost);on(foregroundCanvas,'webglcontextlost',contextLost);
  on(canvas,'webglcontextrestored',contextRestored);on(foregroundCanvas,'webglcontextrestored',contextRestored);
  if(import.meta.env.DEV&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('editor')==='1'){
    const {RouteEditor}=await import('./editor');
    editor=new RouteEditor(canvas,route.config,camera,replaceRoute,()=>follower,()=>route,savedConfig);
    const {mountContentEditor}=await import('./content-editor');contentEditor=mountContentEditor(contentConfig,()=>route.config,()=>camera,(c,rebuild=false)=>{contentConfig=c;if(rebuild)buildSections();else{siteSections=resolveSections(route.config,c);applySiteLayouts();}},()=>editor?.navigate('home'));removers.push(()=>contentEditor?.dispose());
  }
  document.body.classList.add('ready');load.hidden=true;canvas.dataset.ready='true';clockStart=performance.now();restartFrame();
}
function showError(e:unknown){load.hidden=false;load.classList.add('error');detail.textContent=e instanceof Error?e.message:String(e);load.querySelector('strong')!.textContent=translate('loading.error');console.error(e);}
initLanguagePicker();refreshLocalization();
void start().catch(showError);
if(import.meta.hot)import.meta.hot.dispose(()=>{disposed=true;cancelAnimationFrame(raf);worker?.terminate();editor?.dispose();renderer?.dispose();foregroundRenderer?.dispose();for(const off of removers)off();});
