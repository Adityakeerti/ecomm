const axios = require('axios');

/**
 * Optimise the delivery route for a set of stops using the configured routing provider.
 *
 * @param {Array<{order_id: string, lat: number, lng: number, address_line: string}>} stops
 * @returns {Promise<Array>} stops reordered in optimised delivery sequence
 */
async function optimiseRoute(stops) {
  // If 0 or 1 stop, skip API entirely — no optimisation needed
  if (!stops || stops.length <= 1) {
    return stops || [];
  }

  const provider = (process.env.MAP_ROUTING_PROVIDER || 'ors').toLowerCase();

  if (provider === 'google') {
    // TODO: implement googleOptimise() when Google Maps billing is enabled
    throw new Error('Google Maps not configured');
  }

  if (provider !== 'ors') {
    console.warn(`Unknown routing provider "${provider}", using original order`);
    return stops;
  }

  // --- ORS (OpenRouteService) optimisation ---
  try {
    const apiKey = process.env.ORS_API_KEY;
    if (!apiKey) {
      console.warn('ORS_API_KEY not set, using original order');
      return stops;
    }

    // Build the jobs array from stops
    // IMPORTANT: ORS uses [lng, lat] order, NOT [lat, lng]
    const jobs = stops.map((stop, index) => ({
      id: index,
      location: [parseFloat(stop.lng), parseFloat(stop.lat)],
      description: stop.address_line || `Stop ${index + 1}`
    }));

    // Vehicle starts and ends at the first stop's coordinates
    const startCoords = [parseFloat(stops[0].lng), parseFloat(stops[0].lat)];

    const requestBody = {
      jobs,
      vehicles: [
        {
          id: 1,
          profile: 'driving-car',
          start: startCoords,
          end: startCoords
        }
      ]
    };

    const response = await axios.post(
      'https://api.openrouteservice.org/v2/optimization',
      requestBody,
      {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000 // 15 second timeout
      }
    );

    // Extract optimised order from response
    const route = response.data.routes[0];
    const optimisedSteps = route.steps
      .filter(step => step.type === 'job')
      .map(step => step.job); // original index from the jobs array

    // Reorder stops by the optimised sequence
    const reordered = optimisedSteps.map(jobIndex => stops[jobIndex]);

    return reordered;
  } catch (err) {
    // On failure: log warning and return stops in original order — do NOT crash dispatch
    console.warn('ORS optimisation failed, using original order', err.message || err);
    return stops;
  }
}

module.exports = { optimiseRoute };
