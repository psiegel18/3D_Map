// Cloudflare Worker: Terrain API Proxy
// Uses Open-Topo-Data for elevation and KV for caching

export default {
  async fetch(request, env) {
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

      // Round coordinates for cache key consistency
      const cacheKey = `terrain:${centerLat.toFixed(4)}:${centerLon.toFixed(4)}:${size}:${grid}`;

      // Check KV cache first
      if (env.CACHE) {
        const cached = await env.CACHE.get(cacheKey, 'json');
        if (cached) {
          return new Response(JSON.stringify({ ...cached, cached: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // Generate grid of coordinates
      const kmPerDegLat = 111;
      const kmPerDegLon = 111 * Math.cos(centerLat * Math.PI / 180);

      const locations = [];
      for (let i = 0; i < grid; i++) {
        for (let j = 0; j < grid; j++) {
          const latOffset = (i / (grid - 1) - 0.5) * size / kmPerDegLat;
          const lonOffset = (j / (grid - 1) - 0.5) * size / kmPerDegLon;
          locations.push({
            lat: (centerLat + latOffset).toFixed(6),
            lon: (centerLon + lonOffset).toFixed(6)
          });
        }
      }

      // Fetch elevation data from Open-Topo-Data in batches
      // API limit: 100 locations per request
      const BATCH_SIZE = 100;
      const elevations = [];

      for (let i = 0; i < locations.length; i += BATCH_SIZE) {
        const batch = locations.slice(i, i + BATCH_SIZE);
        const locationsParam = batch.map(l => `${l.lat},${l.lon}`).join('|');

        const elevUrl = `https://api.opentopodata.org/v1/srtm90m?locations=${locationsParam}`;
        const elevRes = await fetch(elevUrl);

        if (!elevRes.ok) {
          const errorText = await elevRes.text();
          throw new Error(`Elevation API failed: ${elevRes.status} - ${errorText.slice(0, 200)}`);
        }

        const elevData = await elevRes.json();

        if (elevData.status !== 'OK' || !elevData.results) {
          throw new Error(`Elevation API error: ${elevData.error || 'Unknown error'}`);
        }

        for (const result of elevData.results) {
          elevations.push(result.elevation);
        }

        // Rate limit: wait between batches (except for last batch)
        if (i + BATCH_SIZE < locations.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const validElevations = elevations.filter(e => e !== null && !isNaN(e));

      if (validElevations.length === 0) {
        throw new Error('No valid elevation data for this location');
      }

      const minElev = Math.min(...validElevations);
      const maxElev = Math.max(...validElevations);

      const result = {
        name,
        center: [centerLat, centerLon],
        elevations,
        minElev,
        maxElev,
        grid
      };

      // Store in KV cache (expires in 30 days)
      if (env.CACHE) {
        await env.CACHE.put(cacheKey, JSON.stringify(result), {
          expirationTtl: 60 * 60 * 24 * 30
        });
      }

      return new Response(JSON.stringify(result), {
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
