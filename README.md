# Atlas México
React + JavaScript + Vite travel explorer. MapLibre/OpenFreeMap with Leaflet/OpenStreetMap fallback. No API key required.

## Local development
```sh
npm install
npm run dev
npm test
npm run build
```
GitHub Actions runs tests and builds before publishing dist to GitHub Pages. Route data is stored in the browser using the previous atlas-route-v1 key. Map coordinates are approximate by area; travel times and road routing are not calculated.
