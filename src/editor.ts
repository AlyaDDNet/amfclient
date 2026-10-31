import './editor.css';
import { CameraRoute, validateRoute, type PathFollower, type RouteConfig, type Section } from './route';
import { GAME_GROUP, groupView, type Camera } from './map/renderer';
import {controls,insertControl,moveControl,removeControl,assertAnchorsUnchanged,emptyRoute,appendAnchor} from './route-edit';
import {appendStroke,RouteHistory,deleteRange,asFreehand} from './freehand';
import type {RouteControl} from './route';
export async function prepareEditorRoute(config:RouteConfig){
  if(config.mode==='freehand')return validateRoute(config);
  const response=await fetch('/__dev/route-backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validateRoute(config))});
  if(!response.ok)throw Error(`Не удалось сохранить исходный маршрут: ${await response.text()}`);
  return asFreehand(config);
}
export class RouteEditor {
  editing=true;
  camera:Camera;
  private config:RouteConfig;
  private selected:string;
  private panel=document.createElement('aside');
  private disposers:(()=>void)[]=[];
  private drag:{id?:string;px:number;py:number;pointer:number}|undefined;
  private status:HTMLOutputElement;
  private routeValid=true;
  private anchors:RouteConfig;
  private savedConfig:RouteConfig;
  private clearUndo:RouteConfig|undefined;
  private replacing=false;
  private tool:'pan'|'draw'|'edit'='edit';
  private history=new RouteHistory();
  private stroke:RouteControl[]|undefined;
  private dragBefore:RouteConfig|undefined;
  private deleteFrom='';
  private get anchorsEditable(){return this.config.mode==='freehand'||this.config.editableAnchors===true||!this.config.points.length;}
  constructor(private canvas:HTMLCanvasElement,config:RouteConfig,camera:Camera,private replace:(r:RouteConfig)=>void,private getFollower:()=>PathFollower,private getRoute:()=>CameraRoute,savedConfig:RouteConfig=config){
    this.config=structuredClone(config);this.anchors=structuredClone(config);this.savedConfig=structuredClone(savedConfig);this.camera={...camera};this.selected=config.points[0]?.id??'';
    this.panel.id='route-editor';this.panel.setAttribute('aria-label','Редактор маршрута');
    this.panel.innerHTML=`<div class="local-tag">LOCAL DEVELOPMENT ONLY</div><h2>Редактор маршрута</h2><p>Перетаскивай карту для свободной камеры. <b>Shift + клик</b> — добавить точку. Точки маршрута можно перетаскивать мышью. Колесо — zoom. <kbd>N</kbd> — Entities.</p><div class="editor-row"><button id="preview-route">Предпросмотр</button><button id="add-point">Точка в центре</button></div><label>Позиция preview <input class="preview-slider" id="preview-progress" aria-label="Позиция предпросмотра" type="range" min="0" max="1000" value="0"/></label><div class="point-list" id="point-list"></div><div class="editor-row"><button id="point-up">↑ Выше</button><button id="point-down">↓ Ниже</button><button id="point-delete">Удалить точку</button></div><label>X <input id="point-x" type="number" step="1" aria-label="X точки"/></label><label>Y <input id="point-y" type="number" step="1" aria-label="Y точки"/></label><label>Zoom точки <input id="point-zoom" type="number" step="0.05" min="0.25" max="6" aria-label="Масштаб точки"/></label><label>Zoom камеры <input id="camera-zoom" type="number" step="0.05" min="0.25" max="6" aria-label="Масштаб камеры"/></label><button id="point-camera">Взять позицию камеры</button><hr/><label>Главная <select id="section-home" aria-label="Точка Главная"></select></label><label>Функции <select id="section-features" aria-label="Точка Функции"></select></label><label>Скачать <select id="section-download" aria-label="Точка Скачать"></select></label><div class="editor-row"><button id="save-route">Сохранить JSON в проект</button><button id="export-route">Экспорт JSON</button><button id="import-route">Загрузить JSON</button></div><input type="file" accept="application/json,.json" id="route-file" hidden/><p>Сохранение изменяет только <code>public/camera-route.json</code>. Оригинальная карта не изменяется. В production редактор отсутствует.</p><output role="status" id="editor-status">Маршрут загружен.</output>`;
    // Only newly added or explicitly edited points become user constraints.
    this.panel.querySelector('h2')!.textContent='Игровой маршрут';
    this.panel.querySelector('p')!.innerHTML='<b>Клик по голубой линии</b> — добавить корректирующую точку. Оранжевые ромбы можно перетаскивать и удалять. Белые обязательные точки зафиксированы. Shift + клик — коррекция под курсором. Свободный обзор — перетаскивание карты; колесо — zoom редактора. <kbd>N</kbd> — Entities.';
    const zoomLabel=this.el<HTMLInputElement>('#point-zoom').closest('label')!;
    zoomLabel.firstChild!.textContent='Единый zoom маршрута ';
    this.el<HTMLInputElement>('#point-zoom').setAttribute('aria-label','Постоянный масштаб маршрута');
    this.el('#point-camera').textContent='Переместить коррекцию в центр камеры';
    this.el('#add-point').textContent='Коррекция в центре';
    this.el('#point-delete').textContent='Удалить коррекцию';
    this.el<HTMLInputElement>('#point-zoom').disabled=true;
    const clearTools=document.createElement('div');clearTools.className='editor-row';clearTools.innerHTML='<button id="clear-route">Очистить маршрут</button><button id="undo-clear" disabled>Отменить очистку</button><button id="restore-route">Восстановить резервную копию</button>';
    this.el('#preview-route').parentElement!.after(clearTools);
    const tools=document.createElement('div');tools.className='editor-row';tools.innerHTML='<button id="draw-mode">Рисовать маршрут</button><button id="edit-mode">Редактировать маршрут</button><button id="pan-mode">Перемещать карту</button><button id="undo-route">Отменить</button><button id="redo-route">Повторить</button><button id="trim-route">Удалить хвост от выбранной точки</button>';clearTools.after(tools);
    this.listen(this.el('#draw-mode'),'click',()=>void this.startDrawing());
    this.panel.querySelector('p')!.textContent='Свободное рисование: линия мышью без ограничений Game Layer. Редактирование: перетаскивание точек и линии; Delete удаляет точку. Перемещение карты — отдельный режим. Ctrl+Z / Ctrl+Y — отменить / повторить. N — Entities.';
    this.listen(this.el('#edit-mode'),'click',()=>void this.startEditing());
    this.listen(this.el('#pan-mode'),'click',()=>{this.tool='pan';this.message('Перемещение карты: левая кнопка мыши.');});
    this.listen(this.el('#undo-route'),'click',()=>this.undo(false));this.listen(this.el('#redo-route'),'click',()=>this.undo(true));
    this.listen(this.el('#trim-route'),'click',()=>{if(this.config.mode!=='freehand')return;this.mutate(r=>{const i=r.points.findIndex(p=>p.id===this.selected);if(i<0)return;r.points.splice(i+1);for(const s of ['home','features','download'] as const)if(!r.points.some(p=>p.id===r.sections[s]))r.sections[s]=this.selected;});});
    const rangeTools=document.createElement('div');rangeTools.className='editor-row';rangeTools.innerHTML='<button id="range-start">Начало удаляемого участка</button><button id="range-delete">Удалить участок до выбранной точки</button>';tools.after(rangeTools);
    this.listen(this.el('#range-start'),'click',()=>{this.deleteFrom=this.selected;this.message('Начало отмечено. Выберите конец участка и нажмите «Удалить участок до выбранной точки».');});
    this.listen(this.el('#range-delete'),'click',()=>{if(this.mutate(r=>Object.assign(r,deleteRange(r,this.deleteFrom,this.selected)))){this.deleteFrom='';this.selected=this.config.points[0]?.id??'';this.refresh();}});
    this.listen(window,'keydown',e=>{const k=e as KeyboardEvent;if(!this.editing||(k.target as HTMLElement).closest('input,select,textarea,[contenteditable=true]'))return;if((k.ctrlKey||k.metaKey)&&['z','y'].includes(k.key.toLowerCase())){k.preventDefault();this.undo(k.key.toLowerCase()==='y'||k.shiftKey);}else if(k.key==='Delete'&&this.selected){k.preventDefault();this.remove();}});
    document.body.append(this.panel);document.body.classList.add('editing');
    this.status=this.el<HTMLOutputElement>('#editor-status');
    this.listen(this.el('#preview-route'),'click',()=>this.setPreview(this.editing));
    this.listen(this.el('#add-point'),'click',()=>this.addForMode(this.camera.x,this.camera.y));
    this.listen(this.el('#clear-route'),'click',()=>void this.clear());
    this.listen(this.el('#undo-clear'),'click',()=>{if(!this.clearUndo)return;const config=this.clearUndo;this.clearUndo=undefined;this.loadDraft(config,'Очистка отменена. Маршрут восстановлен в черновике.');});
    this.listen(this.el('#restore-route'),'click',()=>void this.restoreBackup());
    this.listen(this.el('#point-up'),'click',()=>this.reorder(-1));this.listen(this.el('#point-down'),'click',()=>this.reorder(1));
    this.listen(this.el('#point-delete'),'click',()=>this.remove());
    this.listen(this.el('#point-camera'),'click',()=>this.mutate(r=>{if(controls(r).some(p=>p.id===this.selected))Object.assign(r,moveControl(r,this.selected,this.camera.x,this.camera.y));else if(this.anchorsEditable){const p=r.points.find(p=>p.id===this.selected);if(p){p.x=this.camera.x;p.y=this.camera.y;}}}));
    for(const [id,key] of [['point-x','x'],['point-y','y']] as const)this.listen(this.el(`#${id}`),'change',()=>{const value=Number(this.el<HTMLInputElement>(`#${id}`).value);this.mutate(r=>{const p=controls(r).find(p=>p.id===this.selected)??(this.anchorsEditable?r.points.find(p=>p.id===this.selected):undefined);if(!p)throw Error('Обязательная точка зафиксирована');p[key]=value;});});
    this.listen(this.el('#camera-zoom'),'change',()=>{const zoom=Number(this.el<HTMLInputElement>('#camera-zoom').value);if(Number.isFinite(zoom)&&zoom>=0.25&&zoom<=6)this.camera.zoom=zoom;this.refreshFields();});
    for(const section of ['home','features','download'] as Section[])this.listen(this.el(`#section-${section}`),'change',()=>{if(this.anchorsEditable)this.mutate(r=>{r.sections[section]=this.el<HTMLSelectElement>(`#section-${section}`).value;});});
    this.listen(this.el('#save-route'),'click',()=>void this.save());
    this.listen(this.el('#export-route'),'click',()=>this.export());
    this.listen(this.el('#import-route'),'click',()=>this.el<HTMLInputElement>('#route-file').click());
    this.listen(this.el('#route-file'),'change',()=>void this.import());
    this.listen(this.el('#preview-progress'),'input',()=>{if(!this.routeValid)return;this.setPreview(true);const f=this.getFollower();f.seek(Number(this.el<HTMLInputElement>('#preview-progress').value)/1000*f.route.length);});
    this.listen(canvas,'pointerdown',e=>this.pointerDown(e as PointerEvent));
    this.listen(canvas,'pointermove',e=>this.pointerMove(e as PointerEvent));
    this.listen(canvas,'pointerup',()=>this.endDrag());this.listen(canvas,'pointercancel',()=>{this.stroke=undefined;if(this.dragBefore){this.config=this.dragBefore;this.dragBefore=undefined;}this.drag=undefined;this.refresh();});
    this.refresh();
  }
  private el<T extends HTMLElement=HTMLElement>(s:string){return this.panel.querySelector<T>(s)!;}
  private listen(target:EventTarget,event:string,fn:EventListener){target.addEventListener(event,fn);this.disposers.push(()=>target.removeEventListener(event,fn));}
  private message(s:string,error=false){this.status.textContent=s;this.status.classList.toggle('warning',error);}
  private confirmDialog(text:string):Promise<boolean>{return new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='route-confirm';dialog.setAttribute('aria-label','Подтверждение изменения маршрута');const p=document.createElement('p');p.textContent=text;const row=document.createElement('div');row.className='editor-row';const cancel=document.createElement('button'),ok=document.createElement('button');cancel.textContent='Отмена';cancel.autofocus=true;ok.textContent='Подтвердить';cancel.onclick=()=>dialog.close('no');ok.onclick=()=>dialog.close('yes');row.append(cancel,ok);dialog.append(p,row);dialog.addEventListener('close',()=>{const result=dialog.returnValue==='yes';dialog.remove();resolve(result);},{once:true});document.body.append(dialog);dialog.showModal();});}
  private undo(redo:boolean){this.endDrag();const r=redo?this.history.redo(this.config):this.history.undo(this.config);if(r)this.loadDraft(r,redo?'Действие повторено.':'Действие отменено.');}
  private async startDrawing(){
    this.setPreview(false);
    if(!await this.enableManual())return;
    this.tool='draw';this.message('Рисуйте левой кнопкой мыши. Продолжение начинается с конца линии. Для перемещения карты выберите «Перемещать карту».');
  }
  private async enableManual(){
    if(this.config.mode==='freehand')return true;
    if(!await this.confirmDialog('Перевести существующие точки и коррекции в ручной маршрут без ограничений стен? Их координаты, ID, порядок и привязки разделов сохранятся; автоматические обходы стен исчезнут. Сначала будет создана резервная копия. Файл изменится только после сохранения.'))return false;
    try{await this.backupDraft();const id=this.selected;this.history.push(this.config);this.loadDraft(asFreehand(this.config),'Ручной маршрут включён: стены не ограничивают линию. Все точки и коррекции сохранены.');this.selected=id;this.refresh();return true;}catch(e){this.message((e as Error).message,true);return false;}
  }
  private async startEditing(){this.setPreview(false);if(!await this.enableManual())return;this.tool='edit';this.message('Ручное редактирование: перетаскивайте точки и линию через любые тайлы. Delete удаляет выбранную точку.');}
  private mutate(change:(r:RouteConfig)=>void){
    try{const candidate=structuredClone(this.config);change(candidate);validateRoute(candidate);if(!this.anchorsEditable)assertAnchorsUnchanged(this.anchors,candidate);else this.replacing=true;this.history.push(this.dragBefore??this.config);this.dragBefore=undefined;this.config=candidate;
      try{this.replace(candidate);this.routeValid=true;this.message('Путь перестроен. Есть несохранённые изменения.');}
      catch(e){this.routeValid=false;this.message(`${(e as Error).message} Исправьте или удалите точку; координаты не перенесены. Предпросмотр и сохранение отключены.`,true);}
      this.refresh();return true;}
    catch(e){this.message(e instanceof Error?e.message:String(e),true);this.refreshFields();return false;}
  }
  private add(x:number,y:number,hit=this.getRoute().hit({x,y})){
    if(!this.routeValid){this.message('Сначала исправьте или удалите недопустимую коррекцию.',true);return;}
    const id=`control-${crypto.randomUUID().slice(0,8)}`;
    if(this.mutate(r=>Object.assign(r,insertControl(r,hit.leg,hit.insert,{id,x,y})))){this.selected=id;this.refresh();return id;}
  }
  private addForMode(x:number,y:number){if(!this.anchorsEditable)return this.add(x,y);const id=`point-${crypto.randomUUID().slice(0,8)}`;if(this.mutate(r=>Object.assign(r,appendAnchor(r,{id,x,y})))){this.selected=id;this.refresh();}}
  private remove(){const segment=this.config.segments?.find(s=>s.points.some(p=>p.id===this.selected));if(!segment){if(!this.anchorsEditable){this.message('Обязательные точки нельзя удалять.',true);return;}if(this.mutate(r=>{r.points=r.points.filter(p=>p.id!==this.selected);r.segments=r.segments?.filter(s=>r.points.some((p,i)=>p.id===s.from&&r.points[i+1]?.id===s.to));for(const s of ['home','features','download'] as const)if(r.sections[s]===this.selected)r.sections[s]=r.points[0]?.id??'';})){this.selected=this.config.points[0]?.id??'';this.refresh();}return;}if(this.mutate(r=>Object.assign(r,removeControl(r,this.selected)))){this.selected=segment.from;this.refresh();}}
  private reorder(direction:number){this.mutate(r=>{const segment=r.segments?.find(s=>s.points.some(p=>p.id===this.selected));if(!segment){if(!this.anchorsEditable)throw Error('Порядок обязательных точек зафиксирован');const i=r.points.findIndex(p=>p.id===this.selected),j=i+direction;if(j<0||j>=r.points.length)return;[r.points[i],r.points[j]]=[r.points[j],r.points[i]];return;}const i=segment.points.findIndex(p=>p.id===this.selected),j=i+direction;if(j<0||j>=segment.points.length)return;[segment.points[i],segment.points[j]]=[segment.points[j],segment.points[i]];});}
  private refreshFields(){const control=controls(this.config).find(p=>p.id===this.selected),p=control??this.config.points.find(p=>p.id===this.selected)??this.config.points[0],editable=!!control||!!p&&this.anchorsEditable;for(const key of ['x','y'] as const){const input=this.el<HTMLInputElement>(`#point-${key}`);input.value=p?String(p[key]):'';input.disabled=!editable;}for(const id of ['point-camera','point-up','point-down','point-delete'])this.el<HTMLButtonElement>(`#${id}`).disabled=!editable;this.el<HTMLInputElement>('#point-zoom').value=String(this.config.zoom??this.config.points[0]?.zoom??1.1);this.el<HTMLInputElement>('#camera-zoom').value=this.camera.zoom.toFixed(2);}
  private refresh(){
    this.panel.querySelector('h2')!.textContent=this.config.mode==='freehand'?'Ручной маршрут · без ограничений стен':'Автомаршрут · ограничения Game Layer';
    const list=this.el('#point-list');list.replaceChildren();
    const item=(p:{id:string;x:number;y:number},label:string,control=false)=>{const b=document.createElement('button');b.textContent=label;b.classList.toggle('selected',p.id===this.selected);b.classList.toggle('control-point',control);b.onclick=()=>{this.selected=p.id;if(!this.editing&&this.routeValid&&!control)this.getFollower().goToPoint(p.id);this.refresh();};b.ondblclick=()=>{this.camera={x:p.x,y:p.y,zoom:this.config.zoom??this.config.points[0].zoom};this.setPreview(false);this.refreshFields();};list.append(b);};
    for(const [i,p] of this.config.points.entries()){item(p,`${String(i+1).padStart(2,'0')} ${p.id} · ${this.config.mode==='freehand'?'линия':'обязательная'}`);const segment=this.config.segments?.find(s=>s.from===p.id);for(const [j,c] of (segment?.points??[]).entries())item(c,`◇ ${i+1}.${j+1} ${c.id} · коррекция`,true);}
    for(const section of ['home','features','download'] as Section[]){const select=this.el<HTMLSelectElement>(`#section-${section}`);select.replaceChildren();if(!this.config.points.length){const o=document.createElement('option');o.value='';o.textContent='Не назначено';select.append(o);}for(const [i,p] of this.config.points.entries()){const o=document.createElement('option');o.value=p.id;o.textContent=`${i+1} · ${p.id}`;select.append(o);}select.value=this.config.sections[section];select.disabled=!this.anchorsEditable;}
    this.refreshFields();
    this.el('#point-delete').textContent=this.config.mode==='freehand'?'Удалить выбранную точку':'Удалить коррекцию';
    for(const id of ['preview-route','save-route','preview-progress'])this.el<HTMLButtonElement>(`#${id}`).disabled=!this.routeValid;
    for(const id of ['preview-route','preview-progress'])this.el<HTMLButtonElement>(`#${id}`).disabled=!this.routeValid||this.config.points.length<2;
    this.el<HTMLButtonElement>('#undo-clear').disabled=!this.clearUndo;
    this.el<HTMLButtonElement>('#clear-route').disabled=!this.config.points.length;
    this.el<HTMLButtonElement>('#undo-route').disabled=!this.history.canUndo;this.el<HTMLButtonElement>('#redo-route').disabled=!this.history.canRedo;
    this.el<HTMLButtonElement>('#trim-route').disabled=this.config.mode!=='freehand'||!this.selected;
    for(const id of ['range-start','range-delete'])this.el<HTMLButtonElement>(`#${id}`).disabled=this.config.mode!=='freehand'||!this.selected;
    this.el('#add-point').textContent=this.anchorsEditable?'Точка в центре':'Коррекция в центре';
  }
  private setPreview(enabled:boolean){if(enabled&&!this.routeValid){this.message('Маршрут непроходим. Исправьте обязательную точку перед предпросмотром.',true);return;}this.editing=!enabled;document.body.classList.toggle('editing',!enabled);document.body.classList.toggle('editor-preview',enabled);this.el('#preview-route').textContent=enabled?'Вернуться к редактированию':'Предпросмотр';if(enabled){const f=this.getFollower();f.seek(0);f.scroll(f.route.length);}this.endDrag();}
  navigate(_section:Section){if(this.editing)this.setPreview(true);}
  private world(x:number,y:number){const rect=this.canvas.getBoundingClientRect(),v=groupView(this.camera,rect.width/rect.height,GAME_GROUP);return {x:v.x+(x-rect.left)/rect.width*v.width,y:v.y+(y-rect.top)/rect.height*v.height};}
  private pointerDown(e:PointerEvent){
    if(this.editing&&e.button===0&&this.config.mode==='freehand'){
      const p=this.world(e.clientX,e.clientY);
      if(this.tool!=='draw'&&(e.shiftKey||this.tool==='edit'&&this.config.points.length<2)){this.addForMode(p.x,p.y);return;}
      if(this.tool==='draw'){
        const end=this.config.points.at(-1),v=groupView(this.camera,this.canvas.clientWidth/this.canvas.clientHeight,GAME_GROUP),radius=24*v.width/this.canvas.clientWidth;
        if(end&&Math.hypot(end.x-p.x,end.y-p.y)>radius){this.message('Начните продолжение рядом с концом линии; используйте перемещение карты.',true);return;}
        this.stroke=[end?{id:`draw-${crypto.randomUUID()}`,x:end.x,y:end.y}:{id:`draw-${crypto.randomUUID()}`,...p}];this.drag={px:e.clientX,py:e.clientY,pointer:e.pointerId};this.canvas.setPointerCapture(e.pointerId);return;
      }
      if(this.tool==='pan'){this.drag={px:e.clientX,py:e.clientY,pointer:e.pointerId};this.canvas.setPointerCapture(e.pointerId);return;}
      this.dragBefore=structuredClone(this.config);
      const v=groupView(this.camera,this.canvas.clientWidth/this.canvas.clientHeight,GAME_GROUP),radius=12*v.width/this.canvas.clientWidth;
      let point=this.config.points.find(q=>Math.hypot(q.x-p.x,q.y-p.y)<radius);
      if(!point){const hit=this.getRoute().hit(p);if(hit.gap<radius){const id=`draw-${crypto.randomUUID()}`;this.config.points.splice(hit.leg+1,0,{id,...hit.point,zoom:this.config.zoom??1.1});point=this.config.points[hit.leg+1];}}
      if(point){this.selected=point.id;this.drag={id:point.id,px:e.clientX,py:e.clientY,pointer:e.pointerId};this.canvas.setPointerCapture(e.pointerId);this.refresh();}else this.dragBefore=undefined;
      return;
    }
    if(!this.editing||e.button!==0)return;const p=this.world(e.clientX,e.clientY),rect=this.canvas.getBoundingClientRect(),v=groupView(this.camera,rect.width/rect.height,GAME_GROUP),radius=12*v.width/rect.width;
    if(e.shiftKey||this.config.points.length<2){this.addForMode(p.x,p.y);return;}
    const control=controls(this.config).find(q=>Math.hypot(q.x-p.x,q.y-p.y)<=radius),anchor=this.config.points.find(q=>Math.hypot(q.x-p.x,q.y-p.y)<=radius);
    let id=control?.id;
    if(!id&&anchor){this.selected=anchor.id;this.refresh();if(this.anchorsEditable)id=anchor.id;else{this.message('Обязательная точка зафиксирована. Меняйте форму соседнего участка оранжевыми коррекциями.');return;}}
    if(!id&&this.routeValid){const hit=this.getRoute().hit(p);if(hit.gap<=10*v.width/rect.width)id=this.add(hit.point.x,hit.point.y,hit);}
    if(id){this.selected=id;this.refresh();}
    this.dragBefore??=structuredClone(this.config);this.drag={id,px:e.clientX,py:e.clientY,pointer:e.pointerId};this.canvas.setPointerCapture(e.pointerId);
  }
  private pointerMove(e:PointerEvent){if(!this.editing||!this.drag)return;const d=this.drag;
    if(this.stroke){const p=this.world(e.clientX,e.clientY),last=this.stroke.at(-1)!;if(Math.hypot(last.x-p.x,last.y-p.y)>3)this.stroke.push({id:`draw-${crypto.randomUUID()}`,...p});return;}
    if(d.id){const p=this.world(e.clientX,e.clientY),point=controls(this.config).find(p=>p.id===d.id)??(this.anchorsEditable?this.config.points.find(p=>p.id===d.id):undefined);if(!point)return;point.x=p.x;point.y=p.y;this.refreshFields();this.message('Точка перемещается. Путь перестроится после отпускания мыши.');}else {const rect=this.canvas.getBoundingClientRect(),v=groupView(this.camera,rect.width/rect.height,GAME_GROUP);this.camera.x-=(e.clientX-d.px)/rect.width*v.width;this.camera.y-=(e.clientY-d.py)/rect.height*v.height;}d.px=e.clientX;d.py=e.clientY;}
  private endDrag(){const id=this.drag?.id,stroke=this.stroke;this.stroke=undefined;if(this.drag&&this.canvas.hasPointerCapture(this.drag.pointer))this.canvas.releasePointerCapture(this.drag.pointer);this.drag=undefined;
    if(stroke){if(stroke.length>1)this.mutate(r=>Object.assign(r,appendStroke(r,stroke)));}
    else if(id)this.mutate(()=>{});
    if(this.config.mode==='freehand'&&this.routeValid){const n=this.getRoute().navigation;if(n&&this.config.points.some(p=>Math.min(p.x,p.y,n.width*32-p.x,n.height*32-p.y)<32))this.message('Предупреждение: маршрут у края карты. Координаты не изменены.');}
  }
  handleWheel(e:WheelEvent){if(!this.editing)return false;const before=this.world(e.clientX,e.clientY);this.camera.zoom=Math.max(0.25,Math.min(6,this.camera.zoom*Math.exp(e.deltaY*0.001)));const after=this.world(e.clientX,e.clientY);this.camera.x+=before.x-after.x;this.camera.y+=before.y-after.y;this.refreshFields();return true;}
  draw(ctx:CanvasRenderingContext2D,route:CameraRoute,camera:Camera){
    if(!this.editing)return;
    const w=ctx.canvas.clientWidth,h=ctx.canvas.clientHeight,v=groupView(camera,w/h,GAME_GROUP),screen=(x:number,y:number)=>[(x-v.x)/v.width*w,(y-v.y)/v.height*h];
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#071524';ctx.lineWidth=6;ctx.beginPath();for(const [i,p] of route.geometry.entries()){const [x,y]=screen(p.x,p.y);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();ctx.strokeStyle=this.routeValid?'#83d5ff':'#ff786e';ctx.lineWidth=3;ctx.stroke();
    if(this.stroke){ctx.beginPath();this.stroke.forEach((p,i)=>{const [x,y]=screen(p.x,p.y);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle='#f3e4a3';ctx.stroke();}
    let lastDot:number[]|undefined;for(const p of route.geometry){const [x,y]=screen(p.x,p.y);if(x<0||y<0||x>w||y>h)continue;if(lastDot&&Math.hypot(x-lastDot[0],y-lastDot[1])<30)continue;ctx.fillStyle='#c8f1ff';ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();lastDot=[x,y];}
    for(const [i,p] of this.config.points.entries()){const [x,y]=screen(p.x,p.y);ctx.fillStyle=p.id===this.selected?'#d1f1ff':'#183952';ctx.strokeStyle='#a9dfff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,p.id===this.selected?9:this.config.mode==='freehand'?3:7,0,Math.PI*2);ctx.fill();ctx.stroke();if(this.config.mode!=='freehand'||p.id===this.selected||!i||i===this.config.points.length-1){ctx.font='12px system-ui';ctx.textAlign='left';ctx.fillStyle='#f0f7ff';ctx.fillText(this.config.mode==='freehand'?`${i+1}${i===this.config.points.length-1?' · конец':''}`:`${i+1} · ${p.id}`,x+14,y-12);}}
    for(const p of controls(this.config)){const [x,y]=screen(p.x,p.y);ctx.fillStyle=p.id===this.selected?'#fff0d4':'#d69748';ctx.strokeStyle=route.navigation?.visible(p,p)?'#ffda94':'#ff6c65';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y-8);ctx.lineTo(x+8,y);ctx.lineTo(x,y+8);ctx.lineTo(x-8,y);ctx.closePath();ctx.fill();ctx.stroke();}
    ctx.shadowBlur=0;ctx.strokeStyle='#c3eaff77';ctx.beginPath();ctx.moveTo(w/2-8,h/2);ctx.lineTo(w/2+8,h/2);ctx.moveTo(w/2,h/2-8);ctx.lineTo(w/2,h/2+8);ctx.stroke();ctx.restore();
  }
  private async fingerprint(config:RouteConfig){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(validateRoute(config))));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
  private async save(){try{if(!this.routeValid)throw Error('Недопустимый маршрут не сохранён. Исправьте отмеченную точку.');if(!this.config.points.length&&!await this.confirmDialog('Сохранить пустой маршрут? После перезагрузки точки не появятся. Резервную копию можно восстановить отдельно.'))return;const config=validateRoute(this.config),revision=await this.fingerprint(this.savedConfig);const r=await fetch('/__dev/route',{method:'POST',headers:{'Content-Type':'application/json','X-AMF-Route-Version':revision,'X-AMF-Route-Replace':this.replacing||this.anchorsEditable?'confirmed':''},body:JSON.stringify(config,null,2)});if(!r.ok)throw new Error(await r.text());this.savedConfig=structuredClone(config);this.clearUndo=undefined;this.replacing=false;this.refresh();this.message('Сохранено: public/camera-route.json');}catch(e){this.message(e instanceof Error?e.message:String(e),true);}}
  private async backupDraft(){const r=await fetch('/__dev/route-backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validateRoute(this.config))});if(!r.ok)throw Error(await r.text());return (await r.json() as {name:string}).name;}
  private loadDraft(config:RouteConfig,message:string){this.setPreview(false);this.config=asFreehand(config);this.anchors=structuredClone(this.config);this.selected=config.points[0]?.id??'';this.replacing=true;try{this.replace(this.config);this.routeValid=true;this.message(message);}catch(e){this.routeValid=false;this.message(`${message} ${(e as Error).message}`,true);}this.refresh();}
  private async clear(){
    if(!await this.confirmDialog('Очистить весь маршрут, включая обязательные точки и коррекции? Сначала будет создана резервная копия. Файл маршрута изменится только после отдельного сохранения.'))return;
    this.el<HTMLButtonElement>('#clear-route').disabled=true;
    try{const previous=structuredClone(this.config),name=await this.backupDraft();this.history.push(previous);this.clearUndo=previous;this.loadDraft(emptyRoute(previous),`Маршрут очищен в черновике. Резервная копия: artifacts/route-backups/${name}. Для записи пустого маршрута нажмите «Сохранить JSON в проект».`);}
    catch(e){this.message(`Очистка отменена: ${(e as Error).message}`,true);this.refresh();}
  }
  private async restoreBackup(){try{const r=await fetch('/__dev/route-backup');if(!r.ok)throw Error(await r.text());const saved=await r.json() as {name:string;config:RouteConfig};if(!await this.confirmDialog(`Восстановить резервную копию ${saved.name}? Текущий черновик также будет скопирован.`))return;await this.backupDraft();const zoom=this.config.zoom??this.config.points[0]?.zoom??1.1;if((saved.config.zoom??saved.config.points[0]?.zoom??1.1)!==zoom)throw Error('Масштаб резервной копии отличается. Автоматическая смена zoom запрещена.');this.history.push(this.config);this.loadDraft(saved.config,'Резервная копия восстановлена в черновике. Нажмите «Сохранить JSON в проект».');}catch(e){this.message((e as Error).message,true);}}
  private export(){const blob=new Blob([JSON.stringify(validateRoute(this.config),null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='camera-route.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.message('JSON экспортирован.');}
  private async import(){const input=this.el<HTMLInputElement>('#route-file'),file=input.files?.[0];if(!file)return;try{if(file.size>8*1024*1024)throw new Error('Маршрут больше 8 MiB');const route=validateRoute(JSON.parse(await file.text()));if(!this.anchorsEditable)assertAnchorsUnchanged(this.anchors,route);if((route.zoom??route.points[0]?.zoom??1.1)!==(this.anchors.zoom??this.anchors.points[0]?.zoom??1.1))throw Error('Импорт не должен менять согласованный постоянный масштаб');this.loadDraft(route,'Маршрут загружен. Сохраните JSON в проект при необходимости.');}catch(e){this.message(e instanceof Error?e.message:String(e),true);}finally{input.value='';}}
  dispose(){this.endDrag();for(const off of this.disposers)off();this.panel.remove();document.body.classList.remove('editing','editor-preview');}
}
