import { readdir,readFile } from 'node:fs/promises';
import { join } from 'node:path';
const files=await readdir('dist/assets');
for(const name of files.filter(f=>/\.(js|css)$/.test(f))){const text=await readFile(join('dist/assets',name),'utf8');for(const secret of ['__dev/route','__dev/site-content','Редактируемый раздел','Редактор маршрута','point-camera','LOCAL DEVELOPMENT ONLY','#route-editor'])if(text.includes(secret))throw new Error(`Developer editor leaked into production: ${name} / ${secret}`);}
if(files.some(f=>f.startsWith('editor-')))throw new Error('Editor chunk in production');
const content=JSON.parse(await readFile('dist/site-sections.json','utf8'));
if(content.sections.length!==7)throw new Error('Expected seven persistent content frames in production.');
for(const section of content.sections){
  if(!section.title?.startsWith('i18n:content.')||!section.subtitle?.startsWith('i18n:content.')||!section.cards.length)throw new Error(`Localized section content is missing: ${section.id}`);
  for(const breakpoint of ['desktop','tablet','mobile']){
    const profile=section.layout?.[breakpoint]??{};
    const parentId=section.layoutRemoved?.includes('nova-panel')?section.layoutItems?.find(item=>item.type==='panel'&&!section.layoutRemoved.includes(item.id))?.id:'nova-panel';
    if(!profile[parentId])throw new Error(`Outer frame is missing for ${section.id}/${breakpoint}`);
    for(const id of ['title','subtitle',...section.cards.map((_,i)=>`card-${i}`),...section.actions.map((_,i)=>`action-${i}`)]){
      if(!profile[id]||profile[id].coordinateSpace!=='parent'||profile[id].parentId!==parentId)throw new Error(`Content is not placed inside its outer frame: ${section.id}/${breakpoint}/${id}`);
    }
  }
}
const download=content.sections.find(section=>section.id==='download');
if(download?.actions?.[0]?.download!==true||download.actions[0].href!=='https://github.com/AlyaDDNet/AMF-Client/releases/download/v2.0.1/AMFClient-2.0.1-Nova-Portable.zip')throw new Error('The direct Windows Portable action is missing from the download frame.');
const bundleText=(await Promise.all(files.filter(f=>f.endsWith('.js')).map(f=>readFile(join('dist/assets',f),'utf8')))).join('\n');
if(!bundleText.includes('https://github.com/AlyaDDNet/AMF-Client/releases/download/v2.0.1/AMFClient-2.0.1-Nova-Portable.zip'))throw new Error('The verified direct Windows download configuration was not retained in the production bundle.');
console.log('Production check passed: editor code is absent, seven localized content frames are configured for three breakpoints, and the direct Windows x64 asset remains available.');
