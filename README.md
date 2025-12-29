# 3D Terrain Explorer

Interactive 3D topographical map viewer using real elevation data. Search any location on Earth and explore its terrain in 3D.

**Live:** [3d-map.psiegel.org](https://3d-map.psiegel.org) 

## Features

- **Location Search** — Enter any place name or coordinates
- **Real Elevation Data** — Powered by Open-Topo-Data's SRTM elevation API
- **3D Visualization** — Rotate, pan, and zoom the terrain with Three.js
- **Multiple Color Modes** — Terrain gradient or satellite-style coloring
- **Contour Lines** — Toggle topographic contours
- **Elevation on Hover** — See exact elevation at cursor position
- **Shareable URLs** — Link directly to any location (e.g., `?q=Mount+Fuji`)
- **Adjustable Parameters** — Area size (1-50km) and vertical exaggeration

## Architecture

```
3d-map.psiegel.org       →  Cloudflare Pages (index.html)
map-api.psiegel.org      →  Cloudflare Worker (worker.js)
```

- **Frontend:** Static HTML/JS using Three.js for 3D rendering
- **Backend:** Cloudflare Worker proxying geocoding (Nominatim) and elevation (Open-Topo-Data) APIs
- **Caching:** KV namespace stores results for 30 days

## Try These Locations

- Mount Everest
- Grand Canyon
- Mount Fuji
- Swiss Alps
- Death Valley
- Yosemite Valley

## Local Development

Open `index.html` in a browser. The API calls go to the deployed worker at `map-api.psiegel.org`.

## Deployment

Both services auto-deploy from this repo:

- **Pages:** Serves `index.html` as static site
- **Worker:** Uses `wrangler.toml` to deploy `worker.js`
