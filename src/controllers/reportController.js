const Session = require('../models/Session');
const Report = require('../models/Report');
const { getAIResponse } = require('../utils/aiService');

// @desc    Analyze transcript and generate final report
// @route   POST /api/interview/report/:sessionId
exports.generateReport = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    // 1. Prepare Transcript for AI
    const conversation = session.transcript.map(m => `${m.role}: ${m.content}`).join('\n');

    // 2. AI Prompt for Evaluation (Mentor Persona)
    const evaluationPrompt = `
      You are a friendly and constructive Interview Coach. 
      Your goal is to help the candidate, ${req.user.name}, improve their interview skills.
      
      TRANSCRIPT OF THE INTERVIEW:
      ${conversation}

      EVALUATION GUIDELINES:
      - Be encouraging but honest.
      - Address the candidate directly as '${req.user.name}'. 
      - Use phrases like "You could...", "Try to focus on...", "Next time, consider...".
      - Do not refer to them as "The Candidate". Talk TO them, not ABOUT them.

      JSON OUTPUT FORMAT:
      {
        "overallScore": number (0-100),
        "metrics": {
          "technicalDepth": number,
          "communication": number,
          "problemSolving": number,
          "confidence": number
        },
        "strengths": ["3 positive highlights of what ${req.user.name} did well"],
        "growth": ["3 constructive suggestions on how ${req.user.name} can improve"],
        "suggestedTopics": ["3 topics for ${req.user.name} to study"]
      }
      
      STRICT RULE: ONLY return valid JSON.
    `;

    // 3. Get AI Evaluation
    const aiResponse = await getAIResponse([{ role: 'user', content: evaluationPrompt }], "You are a professional auditor.");
    
    if (!aiResponse) {
      console.error('AI Response was empty for report generation.');
      throw new Error('AI failed to return any content for the evaluation.');
    }

    // Smart JSON extraction
    let evaluation;
    try {
      // Strip markdown code blocks if AI added them
      const cleaned = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      const startIdx = cleaned.indexOf('{');
      const endIdx = cleaned.lastIndexOf('}');
      
      if (startIdx !== -1 && endIdx !== -1) {
        evaluation = JSON.parse(cleaned.substring(startIdx, endIdx + 1));
      } else {
        throw new Error('No JSON object found');
      }
    } catch (e) {
      console.error('JSON Parse Failed:', e.message, 'Raw:', aiResponse);
      throw new Error('AI Evaluation JSON was malformed.');
    }

    // 4. Save Report to DB
    const report = await Report.create({
      sessionId,
      userId: req.user._id,
      overallScore: evaluation.overallScore || 0,
      metrics: evaluation.metrics || {},
      strengths: evaluation.strengths || [],
      growth: evaluation.growth || [],
      suggestedTopics: evaluation.suggestedTopics || []
    });

    // 5. Update Session status to completed
    session.status = 'completed';
    await session.save();

    res.status(201).json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Report Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate report.',
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
};

// @desc    Get all session history for user
// @route   GET /api/interview/history
exports.getHistory = async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.user._id }).sort({ createdAt: -1 });
    
    // Har session ka report dhundo agar hai toh
    const history = await Promise.all(sessions.map(async (sess) => {
      const report = await Report.findOne({ sessionId: sess._id });
      return {
        _id: sess._id,
        status: sess.status,
        createdAt: sess.createdAt,
        jobDescription: sess.jobDescription,
        score: report ? report.overallScore : null,
        reportId: report ? report._id : null
      };
    }));

    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch history' });
  }
};

// @desc    Get report by sessionId
// @route   GET /api/interview/report/:sessionId
exports.getReport = async (req, res) => {
  try {
    const report = await Report.findOne({ sessionId: req.params.sessionId });
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
