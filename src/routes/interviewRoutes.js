const express = require('express');
const router = express.Router();
const { ingestDocument, getUserResumeStatus } = require('../controllers/interviewController');
const { handleChat, getHint, getSession } = require('../controllers/chatController');
const { generateReport, getHistory, getReport, deleteHistoryItem, clearAllHistory } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Route: GET /api/interview/resume-status
router.get('/resume-status', protect, getUserResumeStatus);

// Route: POST /api/interview/ingest (File is now optional if resume is already saved)
router.post('/ingest', protect, upload.single('resume'), ingestDocument);

// Route: POST /api/interview/chat/:sessionId
router.post('/chat/:sessionId', protect, handleChat);


// Route: GET /api/interview/session/:sessionId (Refresh recovery)
router.get('/session/:sessionId', protect, getSession);

// Route: POST /api/interview/hint/:sessionId
router.post('/hint/:sessionId', protect, getHint);

// History Routes
router.get('/history', protect, getHistory);
router.delete('/history', protect, clearAllHistory);
router.delete('/history/:sessionId', protect, deleteHistoryItem);

// Report Routes
router.post('/report/:sessionId', protect, generateReport);
router.get('/report/:sessionId', protect, getReport);

module.exports = router;
