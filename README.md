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
`src/data/places.json` is the single source of truth. Missing individual coordinates remain null in JSON; the UI uses clearly labeled neighborhood centroids for discovery only, never for actual route segments. `npm run geocode` queries OpenStreetMap Overpass in batches, writes exact-name geographically plausible matches and emits `geocoding-report.json` for ambiguous/missing matches. Review source records and address before travel. OpenStreetMap data © OpenStreetMap contributors (ODbL).

## Bulk geographic rebuild
Use `python scripts/rebuild_geo.py --osm mexico-latest.osm.pbf --denue denue.zip --apply` after installing `osmium`. Obtain DENUE files from https://www.inegi.org.mx/app/descarga/ and Mexico OSM PBF from https://download.geofabrik.de/north-america/mexico.html. The workflow downloads OSM automatically; official DENUE ZIP URLs can be provided at manual dispatch. Ambiguous and conflicting matches appear in geocoding-report.json, not as fabricated coordinates. Existing sourced records are retained and discrepancies reported. OSM data © OpenStreetMap contributors, ODbL.
