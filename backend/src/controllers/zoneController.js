const pool = require('../utils/db');
const { haversineKm } = require('../utils/geo');
const { ok } = require('../utils/response');

/**
 * POST /v1/zones/validate
 * Body: { lat, lng }
 * Checks if the customer's GPS coordinates fall inside any active delivery zone.
 */
exports.validateZone = async (req, res) => {
  try {
    const { lat, lng } = req.body;

    if (lat == null || lng == null) {
      return res.status(400).json({
        success: false,
        message: 'lat and lng are required'
      });
    }

    // Fetch all active zones
    const { rows: zones } = await pool.query(
      `SELECT id, label, center_lat, center_lng, radius_km, city_id
       FROM delivery_zones
       WHERE is_active = TRUE`
    );

    // Check each zone using haversine
    for (const zone of zones) {
      const distance = haversineKm(
        parseFloat(lat),
        parseFloat(lng),
        parseFloat(zone.center_lat),
        parseFloat(zone.center_lng)
      );

      if (distance <= parseFloat(zone.radius_km)) {
        return ok(res, {
          valid: true,
          zone_id: zone.id,
          zone_label: zone.label,
          city_id: zone.city_id,
          distance_km: Math.round(distance * 100) / 100
        });
      }
    }

    // No matching zone found
    return ok(res, {
      valid: false,
      message: 'Your location is not within any delivery zone'
    });
  } catch (err) {
    console.error('validateZone error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
