const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');

dotenv.config();

const app = express();

const authRoutes = require('./routes/authRoutes');
const interviewRoutes = require('./routes/interviewRoutes');

// Middleware
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'https://prep-me-mu.vercel.app'
  ].filter(Boolean),
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/interview', interviewRoutes);

// Test Route
app.get('/', (req, res) => {
  res.json({ message: 'PrepMe API is Running...' });
});

module.exports = app;

