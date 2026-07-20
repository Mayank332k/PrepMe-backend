const mongoose = require("mongoose");
const Session = require("../models/Session");

// Middleware to verify that the logged-in user owns the session
exports.checkSessionOwnership = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid session ID format.",
      });
    }

    // Strong query: check both sessionId AND userId
    const session = await Session.findOne({
      _id: sessionId,
      userId: req.user._id,
    });

    // Return 404 instead of 403 - don't reveal session exists but belongs to someone else
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found.",
      });
    }

    // Attach session to request (use sessionDoc to avoid conflict with Express session middleware)
    req.sessionDoc = session;
    next();
  } catch (err) {
    console.error("Ownership Middleware Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Server error occurred while verifying ownership.",
    });
  }
};
