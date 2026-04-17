const fs = require('fs');
const pdf = require('pdf-parse');
const Session = require('../models/Session');
const { parseResumeWithAI, getAIResponse } = require('../utils/aiService');

// @desc    Handle Document upload and session initialization
exports.ingestDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a PDF resume.' });
    }

    // 1. Extract Text from Buffer
    const pdfData = await pdf(req.file.buffer);
    const resumeText = pdfData.text;

    if (!resumeText || resumeText.trim().length === 0) {
      return res.status(400).json({ message: 'Could not extract text from PDF.' });
    }

    // 2. AI Parsing (Resume Structure)
    const profileJson = await parseResumeWithAI(resumeText);

    // 3. Create Session
    const session = await Session.create({
      userId: req.user._id,
      resumeText: resumeText,
      profileJson: profileJson,
      jobDescription: req.body.jobDescription || '',
      status: 'ongoing',
    });

    // 4. Generate Opening Greeting (Phase 1: Ice-breaking)
    const openPrompt = `
      You are an expert technical interviewer at PrepMe. 
      Candidate Name: ${req.user.name}

      TASK: 
      - Welcome ${req.user.name} warmly to the PrepMe platform.
      - Ask how their day is going.
      - Ask if they are ready to begin the interview.
      
      STRICT RULES:
      1. DO NOT ask any technical or background questions yet.
      2. Keep it very brief and friendly (max 2-3 sentences).
      3. Do NOT answer on behalf of the user.
    `;
    const firstMessage = await getAIResponse([], openPrompt);

    session.transcript.push({ role: 'assistant', content: firstMessage, stage: 'introduction' });
    await session.save();

    // 5. Cleanup (Not needed with memoryStorage)

    res.status(201).json({
      success: true,
      sessionId: session._id,
      firstMessage,
      profile: profileJson
    });

  } catch (error) {
    console.error('Ingest Error Details:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error processing document.', 
      error: process.env.NODE_ENV === 'production' ? null : error.message 
    });
  }
};
