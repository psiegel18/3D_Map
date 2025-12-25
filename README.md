# 3D Terrain Explorer

Interactive 3D topographical map viewer using real elevation data. Search any location on Earth and explore its terrain in 3D.

**Live:** [3d-map.psiegel.org](https://3d-map.psiegel.org)

## Features

### Core
- **Location Search** — Enter any place name or coordinates
- **Famous Locations** — Quick access dropdown with iconic terrain
- **Real Elevation Data** — Powered by Open-Topo-Data's SRTM elevation API
- **3D Visualization** — Rotate, pan, and zoom the terrain with Three.js
- **Multiple View Modes** — Terrain gradient, street map, or satellite imagery
- **Water Plane** — Toggle sea level visualization
- **Adjustable Parameters** — Area size (1-200km), vertical exaggeration, resolution

### Tools
- **Measurement Tool** — Click two points to measure distance
- **Elevation Profile** — Draw a line to see elevation changes along a path
- **GPX/KML Import** — Load hiking trails or routes from GPS files
- **Screenshot** — Save the current view as PNG
- **Embed Generator** — Get iframe code to embed on other sites

### Display
- **Contour Lines** — Toggle topographic contours
- **Compass Rose** — Shows current orientation
- **Scale Bar** — Dynamic scale indicator
- **Sun Angle** — Adjust lighting direction
- **Elevation on Hover** — See exact elevation at cursor position

### Navigation
- **Auto-Rotate** — Automatic presentation mode rotation
- **Fullscreen** — Immersive full-window viewing
- **Keyboard Shortcuts** — F (fullscreen), R (rotate), M (measure), P (profile), arrows (pan)
- **Pinch-to-Zoom** — Touch gesture support on mobile
- **Shareable URLs** — Link directly to any location (e.g., `?q=Mount+Fuji`)
- **Recent Searches** — Quick access to previously searched locations

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
