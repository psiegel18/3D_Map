// Cloudflare Worker: Terrain API Proxy
// Deploy this to your Cloudflare Worker at map-api.psiegel.org

export default {
  async fetch(request) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');
    const size = parseFloat(url.searchParams.get('size')) || 10;
    const grid = parseInt(url.searchParams.get('grid')) || 40;

    try {
      let centerLat, centerLon, name;

      // Get coordinates from query or direct lat/lon
      if (q) {
        const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
        const geoRes = await fetch(geoUrl, {
          headers: { 'User-Agent': 'TerrainExplorer/1.0' }
        });

        if (!geoRes.ok) {
          throw new Error(`Geocoding failed: ${geoRes.status}`);
        }

        const geoData = await geoRes.json();

        if (!geoData || geoData.length === 0) {
          return new Response(JSON.stringify({ error: 'Location not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        centerLat = parseFloat(geoData[0].lat);
        centerLon = parseFloat(geoData[0].lon);
        name = geoData[0].display_name;
      } else if (lat && lon) {
        centerLat = parseFloat(lat);
        centerLon = parseFloat(lon);
        name = `${centerLat.toFixed(4)}°, ${centerLon.toFixed(4)}°`;
      } else {
        return new Response(JSON.stringify({ error: 'Provide ?q=location or ?lat=X&lon=Y' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Validate coordinates
      if (isNaN(centerLat) || isNaN(centerLon)) {
        return new Response(JSON.stringify({ error: 'Invalid coordinates' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Generate grid of coordinates
      const kmPerDegLat = 111;
      const kmPerDegLon = 111 * Math.cos(centerLat * Math.PI / 180);
      const halfSize = size / 2;

      const lats = [];
      const lons = [];

      for (let i = 0; i < grid; i++) {
        for (let j = 0; j < grid; j++) {
          const latOffset = (i / (grid - 1) - 0.5) * size / kmPerDegLat;
          const lonOffset = (j / (grid - 1) - 0.5) * size / kmPerDegLon;
          lats.push((centerLat + latOffset).toFixed(6));
          lons.push((centerLon + lonOffset).toFixed(6));
        }
      }

      // Fetch elevation data from Open-Meteo
      const elevUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lons.join(',')}`;
      const elevRes = await fetch(elevUrl);

      if (!elevRes.ok) {
        const errorText = await elevRes.text();
        throw new Error(`Elevation API failed: ${elevRes.status} - ${errorText.slice(0, 200)}`);
      }

      const elevData = await elevRes.json();

      if (!elevData.elevation || !Array.isArray(elevData.elevation)) {
        throw new Error('Invalid elevation data received');
      }

      const elevations = elevData.elevation;
      const validElevations = elevations.filter(e => e !== null && !isNaN(e));

      if (validElevations.length === 0) {
        throw new Error('No valid elevation data for this location');
      }

      const minElev = Math.min(...validElevations);
      const maxElev = Math.max(...validElevations);

      return new Response(JSON.stringify({
        name,
        center: [centerLat, centerLon],
        elevations,
        minElev,
        maxElev,
        grid
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        error: error.message || 'Internal server error',
        details: error.toString()
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
