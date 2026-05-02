const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  resumeText: {
    type: String,
    required: true,
  },
  jobDescription: {
    type: String,
  },
  profileJson: {
    type: Object, // Structured data from AI parsing (Skills, Exp etc.)
  },
  transcript: [
    {
      role: {
        type: String,
        enum: ['user', 'assistant', 'system'],
        required: true,
      },
      content: {
        type: String,
        required: true,
      },
      stage: {
        type: String,
        enum: ['introduction', 'technical', 'behavioral', 'closing'],
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  status: {
    type: String,
    enum: ['ongoing', 'completed'],
    default: 'ongoing',
  },
  summary: {
    type: String,
    default: "",
  },
  lastSummarizedIndex: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
