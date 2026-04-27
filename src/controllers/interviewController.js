const fs = require('fs');
const pdf = require('pdf-parse');
const Session = require('../models/Session');
const { parseResumeWithAI, getAIResponse } = require('../utils/aiService');

const User = require('../models/User');

// @desc    Get user's resume status (if it exists)
exports.getUserResumeStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('resumeName resumeProfile');
    res.status(200).json({
      success: true,
      hasResume: !!user.resumeName,
      resumeName: user.resumeName,
      profile: user.resumeProfile
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error checking resume status' });
  }
};

// @desc    Handle Document upload and session initialization
exports.ingestDocument = async (req, res) => {
  try {
    let resumeText;
    let resumeName;
    let profileJson;

    const user = await User.findById(req.user._id);

    if (req.file) {
      // 1. New File Uploaded - Extract Text from Buffer
      const pdfData = await pdf(req.file.buffer);
      resumeText = pdfData.text;
      resumeName = req.file.originalname;

      console.log(`[Ingest] Extracted text from ${resumeName}, length: ${resumeText?.length}`);

      if (!resumeText || resumeText.trim().length === 0) {
        console.error('[Ingest] Empty text extracted from PDF');
        return res.status(400).json({ message: 'Could not extract text from PDF.' });
      }

      // 2. AI Parsing (Resume Structure)
      profileJson = await parseResumeWithAI(resumeText);

      // 3. Save to User Profile for future use
      user.resumeText = resumeText;
      user.resumeName = resumeName;
      user.resumeProfile = profileJson;
      await user.save();
    } else {
      // 4. Use Saved Resume
      if (!user.resumeText) {
        return res.status(400).json({ message: 'No saved resume found. Please upload a PDF resume.' });
      }
      resumeText = user.resumeText;
      resumeName = user.resumeName;
      profileJson = user.resumeProfile;
    }

    // 5. Create Session
    const session = await Session.create({
      userId: req.user._id,
      resumeText: resumeText,
      profileJson: profileJson,
      jobDescription: req.body.jobDescription || '',
      status: 'ongoing',
    });

    // 6. Generate Opening Greeting (Phase 1: Ice-breaking)
    const openPrompt = `
      You are an AI Technical Interviewer at PrepMe. 
      The candidate's name is ${req.user.name || 'Candidate'}.
      
      RESUME ANALYSIS:
      - Summary: ${profileJson?.summary || 'N/A'}
      - Top Skills: ${(profileJson?.topSkills || []).join(', ')}
      - Experience: ${profileJson?.experienceYears || '0'} years

      ${req.body.jobDescription ? `TARGET JOB DESCRIPTION:
      ${req.body.jobDescription}` : ''}

      INSTRUCTIONS:
      1. Greet the candidate warmly.
      2. Mention that you have reviewed their resume ${req.body.jobDescription ? 'for the target role' : ''}.
      3. Briefly mention one interesting thing from their resume to show you've analyzed it.
      4. Ask how they are doing and if they are ready to begin the interview.
      5. Keep it brief (2-4 sentences).

      # Formatting Rules (CRITICAL for Frontend)
      - Use **Bold** for key names or terms.
      - Use *Italics* for conversational tone or emphasis.
      - Use double line breaks (\n\n) between different parts of the message.
    `;
    const firstMessage = await getAIResponse([], openPrompt);

    session.transcript.push({ 
      role: 'assistant', 
      content: firstMessage || "Hello! I'm your interviewer today. Are you ready to begin?", 
      stage: 'introduction' 
    });
    await session.save();

    res.status(201).json({
      success: true,
      sessionId: session._id,
      firstMessage,
      profile: profileJson,
      resumeName: resumeName
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
