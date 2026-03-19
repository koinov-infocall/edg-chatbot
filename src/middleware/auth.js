const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Липсва токен за автентикация' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      user_id: decoded.user_id,
      role: decoded.role,
      institution_id: decoded.institution_id,
      institution_name: decoded.institution_name,
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Невалиден или изтекъл токен' });
  }
}

module.exports = authMiddleware;
