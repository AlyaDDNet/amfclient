import { unzlibSync } from 'fflate';
export interface Item { type: number; id: number; ints: number[]; bytes: Uint8Array }
const MAX_BYTES = 192 * 1024 * 1024;
export class DataFile {
  readonly items: Item[] = [];
  readonly version: number;
  rawBytes = 0;
  private blocks: (Uint8Array | undefined)[] = [];
  private offsets: number[] = [];
  private sizes: number[] = [];
  private dataStart = 0;
  private dataLength = 0;
  private view: DataView;
  private bytes: Uint8Array;
  constructor(buffer: ArrayBuffer) {
    this.bytes = new Uint8Array(buffer); this.view = new DataView(buffer);
    if(buffer.byteLength < 36 || new TextDecoder().decode(this.bytes.subarray(0,4)) !== 'DATA') throw new Error('Неизвестная сигнатура DATA: ожидается DDNet .map little-endian');
    this.version = this.int(4);
    if(![3,4].includes(this.version)) throw new Error(`Datafile v${this.version} не поддерживается`);
    const nt=this.int(16), ni=this.int(20), nd=this.int(24), itemSize=this.int(28);
    this.dataLength=this.int(32);
    if([nt,ni,nd,itemSize,this.dataLength].some(n=>n<0) || nt>65536 || ni>100000 || nd>100000) throw new Error('Повреждённый заголовок .map');
    const io=36+nt*12, rawOffsets=io+ni*4, rawSizes=rawOffsets+nd*4;
    const itemStart=rawSizes+(this.version===4?nd*4:0);
    this.dataStart=itemStart+itemSize;
    this.range(this.dataStart,this.dataLength);
    for(let i=0;i<nd;i++) {
      const offset=this.int(rawOffsets+i*4), size=this.version===4?this.int(rawSizes+i*4):0;
      if(offset<0 || offset>this.dataLength || (i && offset<this.offsets[i-1]) || size<0 || size>MAX_BYTES) throw new Error('Некорректная таблица data blocks');
      this.offsets.push(offset); this.sizes.push(size);
    }
    if(this.sizes.reduce((a,b)=>a+b,0)>MAX_BYTES) throw new Error('Слишком большой распакованный .map');
    for(let i=0;i<ni;i++) {
      const offset=this.int(io+i*4), at=itemStart+offset;
      if(offset<0 || offset+8>itemSize) throw new Error('Повреждённая таблица items');
      const tid=this.int(at)>>>0, size=this.int(at+4);
      if(size<0 || size%4 || offset+8+size>itemSize) throw new Error('Повреждённый item');
      const ints=Array.from({length:size/4},(_,j)=>this.int(at+8+j*4));
      this.items.push({type:tid>>>16,id:tid&65535,ints,bytes:this.bytes.subarray(at+8,at+8+size)});
    }
  }
  private range(at:number,length:number){if(!Number.isSafeInteger(at+length)||at<0||length<0||at+length>this.bytes.length)throw new Error('Усечённый .map');}
  private int(at:number){this.range(at,4);return this.view.getInt32(at,true);}
  ofType(type:number){return this.items.filter(i=>i.type===type);}
  data(index:number):Uint8Array {
    if(index<0||index>=this.offsets.length)throw new Error(`Недопустимый data index ${index}`);
    if(this.blocks[index])return this.blocks[index]!;
    const start=this.offsets[index],end=this.offsets[index+1]??this.dataLength;
    const raw=this.bytes.subarray(this.dataStart+start,this.dataStart+end);
    const block=this.version===4?unzlibSync(raw,{out:new Uint8Array(this.sizes[index])}):raw.slice();
    if(this.version===4&&block.length!==this.sizes[index])throw new Error('Неверный размер распакованного data block');
    this.rawBytes+=block.length;
    this.blocks[index]=block;return block;
  }
  string(index:number){return index<0?'':new TextDecoder().decode(this.data(index)).split('\0')[0];}
}
export function intString(ints:number[]){return new TextDecoder().decode(Uint8Array.from(ints.flatMap(v=>[24,16,8,0].map(s=>((v>>>s)&255)-128)))).split('\0')[0];}
