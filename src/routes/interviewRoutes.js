const express = require("express");
const router = express.Router();
const {
  ingestDocument,
  getUserResumeStatus,
} = require("../controllers/interviewController");
const {
  handleChat,
  getHint,
  getSession,
  updateSession,
} = require("../controllers/chatController");
const {
  generateReport,
  getHistory,
  getReport,
  deleteHistoryItem,
  clearAllHistory,
} = require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");
const { checkSessionOwnership } = require("../middleware/ownershipMiddleware");
const upload = require("../middleware/uploadMiddleware");

const { checkInterviewLimit } = require("../middleware/rateLimiter");

// Route: GET /api/interview/resume-status
router.get("/resume-status", protect, getUserResumeStatus);

// Route: POST /api/interview/ingest (File is now optional if resume is already saved)
router.post(
  "/ingest",
  protect,
  checkInterviewLimit,
  upload.single("resume"),
  ingestDocument,
);

// Route: POST /api/interview/chat/:sessionId
router.post("/chat/:sessionId", protect, checkSessionOwnership, handleChat);

// Route: GET /api/interview/session/:sessionId (Refresh recovery)
router.get("/session/:sessionId", protect, checkSessionOwnership, getSession);

// Route: PATCH /api/interview/session/:sessionId (Update status: e.g., abandoned)
router.patch(
  "/session/:sessionId",
  protect,
  checkSessionOwnership,
  updateSession,
);

// Route: POST /api/interview/hint/:sessionId
router.post("/hint/:sessionId", protect, checkSessionOwnership, getHint);

// History Routes
router.get("/history", protect, getHistory);
router.delete("/history", protect, clearAllHistory);
router.delete(
  "/history/:sessionId",
  protect,
  checkSessionOwnership,
  deleteHistoryItem,
);

// Report Routes
router.post(
  "/report/:sessionId",
  protect,
  checkSessionOwnership,
  generateReport,
);
router.get("/report/:sessionId", protect, checkSessionOwnership, getReport);

module.exports = router;
