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

    // 2. AI Prompt for Evaluation (Professional Mentor Persona)
    const evaluationPrompt = `
      You are a Senior Technical Recruiter and Career Coach. Your task is to provide a high-fidelity, accurate evaluation of a mock interview based on the provided transcript.

      CANDIDATE: ${req.user.name}
      TARGET ROLE/JOB DESCRIPTION: ${session.jobDescription || 'Not specified'}
      CANDIDATE BACKGROUND (Parsed Resume): ${JSON.stringify(session.profileJson || {})}

      TRANSCRIPT OF THE INTERVIEW:
      ${conversation}

      SCORING RUBRIC (0-100):
      - Technical Depth: Accuracy of technical answers, understanding of core concepts, and ability to explain complex ideas.
      - Communication: Clarity, structure of answers (e.g., STAR method), active listening, and tone.
      - Problem Solving: Logical approach, handling of difficult questions, and critical thinking.
      - Confidence: Pace of speaking, hesitation levels, and overall demeanor.

      EVALUATION GUIDELINES:
      - Be brutally honest but constructive. If the candidate failed a technical question, reflect it in the score.
      - High scores (80+) should only be given if the candidate provided detailed, accurate, and structured answers.
      - Address ${req.user.name} directly.
      - "growth" points must be actionable (e.g., "Instead of just saying X, you should explain the 'why' behind Y").
      - "suggestedTopics" should be specific technical concepts or soft skills mentioned in the transcript.

      JSON OUTPUT FORMAT:
      {
        "overallScore": number (calculated based on average of metrics),
        "metrics": {
          "technicalDepth": number,
          "communication": number,
          "problemSolving": number,
          "confidence": number
        },
        "strengths": ["3 specific evidence-based highlights"],
        "growth": ["3 actionable improvement points with examples from transcript"],
        "suggestedTopics": ["3 specific concepts/skills to study for the target role"]
      }
      
      STRICT RULE: ONLY return valid JSON. Do not include any text outside the JSON block.
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

// @desc    Delete a specific history item
// @route   DELETE /api/interview/history/:sessionId
exports.deleteHistoryItem = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Check if session belongs to user
    const session = await Session.findOne({ _id: sessionId, userId: req.user._id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found or unauthorized' });
    }

    // Delete session and its associated report
    await Session.findByIdAndDelete(sessionId);
    await Report.findOneAndDelete({ sessionId: sessionId });

    res.status(200).json({ success: true, message: 'History item deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete history item' });
  }
};

// @desc    Clear all history for a user
// @route   DELETE /api/interview/history
exports.clearAllHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    // Delete all sessions and reports for this user
    await Session.deleteMany({ userId: userId });
    await Report.deleteMany({ userId: userId });

    res.status(200).json({ success: true, message: 'All history cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to clear history' });
  }
};
