const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  overallScore: {
    type: Number,
    min: 0,
    max: 100,
  },
  metrics: {
    technicalDepth: Number,
    communication: Number,
    problemSolving: Number,
    confidence: Number,
  },
  strengths: [String],
  growth: [String],   
  suggestedTopics: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);
