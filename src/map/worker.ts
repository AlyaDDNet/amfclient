import { parseMap } from './parse';
self.onmessage=(event:MessageEvent<ArrayBuffer>)=>{
  try{
    const model=parseMap(event.data);
    const buffers=new Set<ArrayBuffer>();
    for(const image of model.images)if(image.pixels)buffers.add(image.pixels.buffer as ArrayBuffer);
    for(const layer of model.layers)if(layer.kind==='tiles')buffers.add(layer.tiles.buffer as ArrayBuffer);
    self.postMessage({ok:true,model},[...buffers]);
  }catch(error){self.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});}
};
