# AMF Website deployment

The public site is published from the `main` branch to GitHub Pages at:
`https://alyaddnet.github.io/amfclient/`.

Every push to `main` runs `.github/workflows/deploy.yml`. The workflow installs the locked npm dependencies, runs `npm test`, builds the production bundle with the `/amfclient/` Vite base path, then deploys `dist` using the official GitHub Pages actions. The workflow can also be started manually from the Actions tab.

Local development remains at `http://127.0.0.1:5173/` and uses Vite's relative base. Do not commit `dist`, `node_modules`, `.env` files, logs, or `artifacts` backups.
