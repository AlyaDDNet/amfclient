import { defineConfig } from 'vite';
import { localRouteEditor } from './scripts/route-server';

const base = process.env.GITHUB_PAGES === 'true' ? '/amfclient/' : './';

export default defineConfig({ base, plugins:[localRouteEditor()], server: { host: '127.0.0.1', strictPort: true, port: 5173 }, build: { target: 'es2022' } });
