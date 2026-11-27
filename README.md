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

## Geographic catalog
`src/data/places.json` is the single source of truth. Missing individual coordinates are null, never neighborhood centroids. `npm run geocode` queries OpenStreetMap Overpass in batches, writes exact-name geographically plausible matches and emits `geocoding-report.json` for ambiguous/missing matches. Review source records and address before travel. OpenStreetMap data © OpenStreetMap contributors (ODbL).
