const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  let token;

  // 1. Check if token exists in cookies or headers
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 2. Error agar token nahi mila
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Aap authorized nahi hain. Please login karein.' 
    });
  }

  try {
    // 3. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. User fetch karna DB se
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Ye user exist nahi karta.' 
      });
    }

    next(); // Next middleware/route logic
  } catch (err) {
    console.error('Auth Middleware Error:', err.message);
    return res.status(401).json({ 
      success: false, 
      message: 'Token invalid ya expire ho gaya hai.' 
    });
  }
};
