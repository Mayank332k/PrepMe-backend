const User = require('../models/User');

/**
 * Middleware to check if the user has reached their monthly interview limit.
 * Also handles automatic monthly reset.
 */
const checkInterviewLimit = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const currentMonth = new Date().getMonth();

    // 1. Automatic Monthly Reset Logic
    if (user.lastResetMonth !== currentMonth) {
      console.log(`[RateLimit] Resetting usage for user ${user.email}. New month: ${currentMonth}`);
      user.interviewsUsed = 0;
      user.lastResetMonth = currentMonth;
      // We save here to persist the reset even if the request fails later
      await user.save();
    }

    // 2. Check if limit exceeded
    if (user.interviewsUsed >= user.interviewLimit) {
      return res.status(429).json({
        success: false,
        message: 'Your monthly interview limit has been exhausted.',
        limit: user.interviewLimit,
        used: user.interviewsUsed
      });
    }

    // 3. Attach user to req to avoid re-fetching in controller if needed
    req.fullUser = user; 
    next();
  } catch (error) {
    console.error('Rate Limiter Error:', error);
    res.status(500).json({ success: false, message: 'Error checking rate limit' });
  }
};

module.exports = { checkInterviewLimit };
