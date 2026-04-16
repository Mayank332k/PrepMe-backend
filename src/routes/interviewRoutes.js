const express = require('express');
const router = express.Router();
const { ingestDocument } = require('../controllers/interviewController');
const { handleChat } = require('../controllers/chatController');
const { generateReport, getHistory, getReport } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Route: POST /api/interview/ingest
router.post('/ingest', protect, upload.single('resume'), ingestDocument);

// Route: POST /api/interview/chat/:sessionId
router.post('/chat/:sessionId', protect, handleChat);

// Route: GET /api/interview/history
router.get('/history', protect, getHistory);

// Route: POST /api/interview/report/:sessionId (Generate)
router.post('/report/:sessionId', protect, generateReport);

// Route: GET /api/interview/report/:sessionId (Fetch existing)
router.get('/report/:sessionId', protect, getReport);

module.exports = router;
