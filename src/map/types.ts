export type Vec2 = [number, number];
export type Color = [number, number, number, number];
export interface EnvPoint { time: number; curve: number; values: Color; bezier?: { inX: number[]; inY: number[]; outX: number[]; outY: number[] } }
export interface Envelope { channels: number; synchronized: boolean; points: EnvPoint[] }
export interface MapImage { name: string; width: number; height: number; external: boolean; pixels?: Uint8Array }
export interface EntityMark { x: number; y: number; text: string; angle?: number; force?:number; maxSpeed?:number }
interface LayerBase { id: number; name: string; image: number; flags: number }
export interface TileLayer extends LayerBase { kind: 'tiles'; width: number; height: number; tileFlags: number; tiles: Uint8Array; color: Color; colorEnv: number; colorEnvOffset: number; marks: EntityMark[] }
export interface Quad { points: Vec2[]; colors: Color[]; uv: Vec2[]; posEnv: number; posEnvOffset: number; colorEnv: number; colorEnvOffset: number }
export interface QuadLayer extends LayerBase { kind: 'quads'; quads: Quad[] }
export type Layer = TileLayer | QuadLayer;
export interface Group { name: string; offset: Vec2; parallax: Vec2; clip?: [number, number, number, number]; start: number; count: number }
export interface MapModel { version: number; images: MapImage[]; layers: Layer[]; groups: Group[]; envelopes: Envelope[]; warnings: string[]; metadata: { author: string; license: string; sourceBytes: number; gameWidth: number; gameHeight: number; tiles: number; quads: number; animatedQuads: number; colorBindings: number; rawDataBytes: number; uuidItems: string[] } }
