const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    // Required only for email/password auth
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true, 
  },
  avatar: {
    type: String,
  },
  resumeName: {
    type: String,
  },
  resumeText: {
    type: String,
  },
  resumeProfile: {
    type: Object, // Stores the parsed AI profile
  },
  interviewLimit: {
    type: Number,
    default: 20, // Default 20 interviews per month
  },
  interviewsUsed: {
    type: Number,
    default: 0,
  },
  lastResetMonth: {
    type: Number,
    default: new Date().getMonth(),
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
