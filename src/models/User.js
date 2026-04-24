const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
