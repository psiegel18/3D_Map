// Cloudflare Worker: Terrain API Proxy
// Uses Open-Topo-Data for elevation and KV for caching
// Instrumented with Sentry for error tracking and performance monitoring

import * as Sentry from '@sentry/cloudflare';

export default Sentry.withSentry(
  (env) => {
    const versionId = env.CF_VERSION_METADATA?.id || 'unknown';

    return {
      dsn: env.SENTRY_DSN,
      release: versionId,
      environment: env.ENVIRONMENT || 'production',

      // Include request headers and IP for debugging
      sendDefaultPii: true,

      // Sample 100% of errors, 20% of transactions for performance
      tracesSampleRate: 0.2,

      // Filter out noisy or expected errors
      beforeSend(event, hint) {
        const error = hint?.originalException;
        // Don't send 404s for location not found - these are expected
        if (error?.message === 'Location not found') {
          return null;
        }
        return event;
      },
    };
  },
  {
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

      // Tag all events from this worker to differentiate from frontend
      Sentry.setTag('service', 'map-api');
      Sentry.setTag('component', 'backend');

      // Debug endpoint to test Sentry integration (admin only)
      if (url.pathname === '/debug-sentry') {
        Sentry.setTag('test_type', 'debug_endpoint');

        // Check for admin authentication
        const adminKey = env.ADMIN_API_KEY;
        if (!adminKey) {
          Sentry.setTag('auth_error', 'key_not_configured');
          return new Response(JSON.stringify({
            error: 'Admin endpoint not configured'
          }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Accept token via Authorization header (Bearer token) or query parameter
        const authHeader = request.headers.get('Authorization');
        const queryKey = url.searchParams.get('key');
        const providedKey = authHeader?.startsWith('Bearer ')
          ? authHeader.slice(7)
          : queryKey;

        if (!providedKey || providedKey !== adminKey) {
          Sentry.setTag('auth_error', 'unauthorized');
          return new Response(JSON.stringify({
            error: 'Unauthorized. Admin access required.',
            hint: 'Provide API key via Authorization: Bearer <key> header or ?key=<key> parameter'
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        Sentry.setTag('auth_status', 'authorized');

        // Send a test message
        Sentry.captureMessage('Sentry test from terrain-api worker', 'info');

        // Optionally throw an error to test error capture
        if (url.searchParams.get('error') === 'true') {
          throw new Error('Test error from /debug-sentry endpoint');
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Test message sent to Sentry. Check your Sentry dashboard.',
          tip: 'Add ?error=true to test error capture'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const q = url.searchParams.get('q');
      const lat = url.searchParams.get('lat');
      const lon = url.searchParams.get('lon');
      const size = parseFloat(url.searchParams.get('size')) || 10;
      const grid = parseInt(url.searchParams.get('grid')) || 40;

      // Set tags for all events in this request
      Sentry.setTag('request_type', q ? 'query' : 'coordinates');
      Sentry.setTag('grid_size', grid.toString());
      Sentry.setTag('area_size_km', size.toString());

      if (q) {
        // Truncate long queries for tag value limits (max 200 chars)
        Sentry.setTag('location_query', q.slice(0, 100));
      }

      try {
        let centerLat, centerLon, name;

        // Get coordinates from query or direct lat/lon
        if (q) {
          const geoResult = await Sentry.startSpan(
            { op: 'http.client', name: 'Nominatim Geocoding' },
            async () => {
              Sentry.setTag('api_service', 'nominatim');

              const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
              const geoRes = await fetch(geoUrl, {
                headers: { 'User-Agent': 'TerrainExplorer/1.0' }
              });

              if (!geoRes.ok) {
                Sentry.setTag('geocoding_status', geoRes.status.toString());
                throw new Error(`Geocoding failed: ${geoRes.status}`);
              }

              return geoRes.json();
            }
          );

          if (!geoResult || geoResult.length === 0) {
            Sentry.setTag('geocoding_result', 'not_found');
            return new Response(JSON.stringify({ error: 'Location not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          Sentry.setTag('geocoding_result', 'found');
          centerLat = parseFloat(geoResult[0].lat);
          centerLon = parseFloat(geoResult[0].lon);
          name = geoResult[0].display_name;
        } else if (lat && lon) {
          centerLat = parseFloat(lat);
          centerLon = parseFloat(lon);
          name = `${centerLat.toFixed(4)}, ${centerLon.toFixed(4)}`;
        } else {
          Sentry.setTag('error_type', 'missing_params');
          return new Response(JSON.stringify({ error: 'Provide ?q=location or ?lat=X&lon=Y' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Validate coordinates
        if (isNaN(centerLat) || isNaN(centerLon)) {
          Sentry.setTag('error_type', 'invalid_coordinates');
          return new Response(JSON.stringify({ error: 'Invalid coordinates' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Set coordinate context for debugging
        Sentry.setContext('coordinates', {
          centerLat,
          centerLon,
          name,
        });

        // Round coordinates for cache key consistency
        const cacheKey = `terrain:${centerLat.toFixed(4)}:${centerLon.toFixed(4)}:${size}:${grid}`;

        // Check KV cache first
        if (env.CACHE) {
          const cached = await Sentry.startSpan(
            { op: 'cache.get', name: 'KV Cache Lookup' },
            async () => {
              return env.CACHE.get(cacheKey, 'json');
            }
          );

          if (cached) {
            Sentry.setTag('cache_hit', 'true');
            return new Response(JSON.stringify({ ...cached, cached: true }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        Sentry.setTag('cache_hit', 'false');

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
        const elevations = await Sentry.startSpan(
          { op: 'http.client', name: 'Open-Topo-Data Elevation Fetch' },
          async (span) => {
            Sentry.setTag('api_service', 'opentopodata');

            const BATCH_SIZE = 100;
            const allElevations = [];
            const totalBatches = Math.ceil(locations.length / BATCH_SIZE);

            span.setAttribute('total_locations', locations.length);
            span.setAttribute('total_batches', totalBatches);

            for (let i = 0; i < locations.length; i += BATCH_SIZE) {
              const batchNum = Math.floor(i / BATCH_SIZE) + 1;
              const batch = locations.slice(i, i + BATCH_SIZE);
              const locationsParam = batch.map(l => `${l.lat},${l.lon}`).join('|');

              const batchElevations = await Sentry.startSpan(
                { op: 'http.client', name: `Elevation Batch ${batchNum}/${totalBatches}` },
                async (batchSpan) => {
                  const elevUrl = `https://api.opentopodata.org/v1/srtm90m?locations=${locationsParam}`;
                  const elevRes = await fetch(elevUrl);

                  batchSpan.setAttribute('batch_size', batch.length);
                  batchSpan.setAttribute('http.status_code', elevRes.status);

                  if (!elevRes.ok) {
                    const errorText = await elevRes.text();
                    Sentry.setTag('elevation_api_status', elevRes.status.toString());
                    throw new Error(`Elevation API failed: ${elevRes.status} - ${errorText.slice(0, 200)}`);
                  }

                  const elevData = await elevRes.json();

                  if (elevData.status !== 'OK' || !elevData.results) {
                    Sentry.setContext('elevation_error', {
                      status: elevData.status,
                      error: elevData.error,
                    });
                    throw new Error(`Elevation API error: ${elevData.error || 'Unknown error'}`);
                  }

                  return elevData.results.map(r => r.elevation);
                }
              );

              allElevations.push(...batchElevations);

              // Rate limit: wait between batches (except for last batch)
              if (i + BATCH_SIZE < locations.length) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }

            return allElevations;
          }
        );

        const validElevations = elevations.filter(e => e !== null && !isNaN(e));

        if (validElevations.length === 0) {
          Sentry.setTag('error_type', 'no_elevation_data');
          throw new Error('No valid elevation data for this location');
        }

        const minElev = Math.min(...validElevations);
        const maxElev = Math.max(...validElevations);

        // Set elevation context for debugging
        Sentry.setContext('elevation_stats', {
          totalPoints: elevations.length,
          validPoints: validElevations.length,
          invalidPoints: elevations.length - validElevations.length,
          minElevation: minElev,
          maxElevation: maxElev,
          elevationRange: maxElev - minElev,
        });

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
          await Sentry.startSpan(
            { op: 'cache.put', name: 'KV Cache Store' },
            async () => {
              await env.CACHE.put(cacheKey, JSON.stringify(result), {
                expirationTtl: 60 * 60 * 24 * 30
              });
            }
          );
        }

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        // Sentry automatically captures the error, but we add extra context
        Sentry.setTag('error_type', 'unhandled');
        Sentry.setContext('error_details', {
          message: error.message,
          stack: error.stack,
        });

        // Explicitly capture if not automatically caught
        Sentry.captureException(error);

        return new Response(JSON.stringify({
          error: error.message || 'Internal server error',
          details: error.toString()
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
  }
);
