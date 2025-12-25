# Instructions for Claude: Update psiegel.org

## Task Overview
Update the personal homepage at psiegel.org to include a link to the 3D Terrain Explorer, and create API documentation.

---

## Task 1: Add Link to Homepage

### Context
- The 3D Terrain Explorer is live at: `https://3d-map.psiegel.org`
- It's an interactive 3D topographical map viewer
- Users can search any location and view its terrain in 3D

### Instructions
1. Locate the homepage source files for psiegel.org (likely in a separate repo or directory)
2. Add a project card/link for "3D Terrain Explorer" with:
   - **Title:** 3D Terrain Explorer
   - **URL:** https://3d-map.psiegel.org
   - **Description:** Interactive 3D topographical map viewer. Search any location on Earth and explore its terrain with real elevation data.
   - **Icon suggestion:** 🏔️ or a mountain/map icon

---

## Task 2: Create API Documentation Page

### API Endpoint
```
https://map-api.psiegel.org
```

### API Documentation Content

Create a documentation page (either as part of psiegel.org or as a separate page) with the following information:

#### Base URL
```
https://map-api.psiegel.org
```

#### Authentication
No authentication required. The API is open for public use.

#### Rate Limiting
- Uses Open-Topo-Data backend with automatic request batching
- Responses are cached for 30 days via Cloudflare KV
- Please be respectful with request frequency

#### Endpoints

##### GET /
Fetch elevation data for a location.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes* | Location search query (e.g., "Mount Everest") |
| `lat` | number | Yes* | Latitude coordinate |
| `lon` | number | Yes* | Longitude coordinate |
| `size` | number | No | Area size in km (default: 10, max: 200) |
| `grid` | number | No | Grid resolution (default: 20, options: 20, 30, 40) |

*Either `q` OR both `lat` and `lon` are required.

**Example Requests:**

```bash
# Search by location name
curl "https://map-api.psiegel.org?q=Grand%20Canyon&size=20&grid=20"

# Search by coordinates
curl "https://map-api.psiegel.org?lat=36.0544&lon=-112.1401&size=20&grid=20"
```

**Success Response:**
```json
{
  "name": "Grand Canyon Village, Coconino County, Arizona, United States",
  "center": [36.0544, -112.1401],
  "elevations": [1800, 1850, 1900, ...],  // Array of elevation values in meters
  "minElev": 750,
  "maxElev": 2200,
  "grid": 20
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Resolved location name from geocoding |
| `center` | [lat, lon] | Center coordinates of the terrain area |
| `elevations` | number[] | Flat array of elevation values (grid × grid) in meters |
| `minElev` | number | Minimum elevation in the area (meters) |
| `maxElev` | number | Maximum elevation in the area (meters) |
| `grid` | number | Grid resolution used |

**Error Response:**
```json
{
  "error": "Location not found"
}
```

#### Data Sources
- **Geocoding:** OpenStreetMap Nominatim
- **Elevation:** Open-Topo-Data SRTM 90m dataset

#### Usage Example (JavaScript)

```javascript
async function getTerrainData(location, options = {}) {
  const params = new URLSearchParams({
    q: location,
    size: options.size || 10,
    grid: options.grid || 20
  });

  const response = await fetch(`https://map-api.psiegel.org?${params}`);
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

// Example usage
const terrain = await getTerrainData('Mount Fuji', { size: 30, grid: 30 });
console.log(`Elevation range: ${terrain.minElev}m - ${terrain.maxElev}m`);
```

#### Usage Example (Python)

```python
import requests

def get_terrain_data(location, size=10, grid=20):
    response = requests.get('https://map-api.psiegel.org', params={
        'q': location,
        'size': size,
        'grid': grid
    })
    data = response.json()

    if 'error' in data:
        raise Exception(data['error'])

    return data

# Example usage
terrain = get_terrain_data('Swiss Alps', size=50)
print(f"Center: {terrain['center']}")
print(f"Elevation range: {terrain['minElev']}m - {terrain['maxElev']}m")
```

#### Notes
- The `elevations` array is in row-major order (top-left to bottom-right)
- Grid size affects both detail and response time (larger = slower)
- Very large areas (>100km) may have lower effective resolution due to SRTM data limits

---

## File Suggestions

### Option A: Add to existing docs section
If psiegel.org has a docs or projects section, add the API docs there.

### Option B: Create standalone page
Create `/api/terrain` or `/docs/terrain-api` route with the documentation.

### Option C: Add to 3D Map repo
Create `API.md` in this repo and link to it from the main site.

---

## Styling Notes
Match the existing design of psiegel.org. The 3D Terrain Explorer uses:
- Primary color: `#6366f1` (indigo)
- Background: `#0f0f1a` (dark blue-black)
- Accent: `#f59e0b` (amber/orange)
