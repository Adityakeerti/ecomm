const jwt = require('jsonwebtoken');

/**
 * User auth middleware.
 * Reads Bearer token from Authorization header,
 * validates JWT and ensures role === 'user'.
 * Sets req.user = { userId, email, role }.
 */
module.exports = (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);

    if (decoded.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Forbidden: user token required' });
    }

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};
