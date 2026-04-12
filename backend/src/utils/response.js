/**
 * Standard response helpers — both devs must use these, never send raw res.json.
 */

exports.ok = (res, data, message = 'Success') =>
  res.status(200).json({ success: true, message, data });

exports.created = (res, data, message = 'Created') =>
  res.status(201).json({ success: true, message, data });

exports.error = (res, message = 'Error', errors = [], status = 400) =>
  res.status(status).json({ success: false, message, errors });

exports.notFound = (res, message = 'Not found') =>
  res.status(404).json({ success: false, message, errors: [] });
