const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const {
  googleLogin,
  logout,
  getMe,
  login,
  register,
  checkUsername,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Rate limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: "Too many attempts. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Route: GET /api/auth/check-username
router.get("/check-username", checkUsername);

// Route: POST /api/auth/register
router.post("/register", authLimiter, register);

// Route: POST /api/auth/login
router.post("/login", authLimiter, login);

// Route: POST /api/auth/google
router.post("/google", googleLogin);

// Route: GET /api/auth/logout (No protection needed to clear cookie)
router.get("/logout", logout);

// Route: GET /api/auth/me (PROTECTED - check if user is logged in via cookie)
router.get("/me", protect, getMe);

module.exports = router;
