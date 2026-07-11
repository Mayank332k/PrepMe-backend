const express = require('express');
const router = express.Router();
const { googleLogin, logout, getMe, login, register, checkUsername } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Route: GET /api/auth/check-username
router.get('/check-username', checkUsername);


// Route: POST /api/auth/register
router.post('/register', register);

// Route: POST /api/auth/login
router.post('/login', login);

// Route: POST /api/auth/google
router.post('/google', googleLogin);

// Route: GET /api/auth/logout (No protection needed to clear cookie)
router.get('/logout', logout);

// Route: GET /api/auth/me (PROTECTED - check if user is logged in via cookie)
router.get('/me', protect, getMe);

module.exports = router;
