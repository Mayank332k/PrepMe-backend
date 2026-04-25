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

    // 1. Prepare Transcript (Aggressive Truncation for token saving)
    let conversation = session.transcript.map(m => `${m.role[0]}: ${m.content}`).join('\n');
    if (conversation.length > 5000) conversation = '...' + conversation.slice(-5000);

    // 2. Minimalist AI Prompt
    const evaluationPrompt = `
      Act as Senior Recruiter. Evaluate Interview.
      Candidate: ${req.user.name} | Role: ${session.jobDescription || 'General'}
      
      RESUME SUMMARY: ${JSON.stringify(session.profileJson || {})}
      
      FULL RESUME TEXT:
      ${session.resumeText}
      
      Transcript: ${conversation}

      Metrics(0-100): technicalDepth, communication, problemSolving, confidence.
      Rules: Be honest, address candidate directly, actionable feedback Note - Hardcheck here!.

      Output JSON ONLY (max 3 items per list):
      {
        "overallScore": number,
        "metrics": {"technicalDepth":0, "communication":0, "problemSolving":0, "confidence":0},
        "strengths": ["max 3"], "growth": ["max 3"], "suggestedTopics": ["max 3"]
      }
    `;

    // 3. Get AI Evaluation
    const aiResponse = await getAIResponse([{ role: 'user', content: evaluationPrompt }], "Return ONLY valid JSON.");

    const fallback = {
      overallScore: 50,
      metrics: { technicalDepth: 50, communication: 50, problemSolving: 50, confidence: 50 },
      strengths: ["Interview completed"],
      growth: ["Provide more detailed answers"],
      suggestedTopics: ["Core fundamentals"]
    };

    let evaluation = fallback;

    if (aiResponse && aiResponse.trim().length > 0) {
      try {
        const cleaned = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const startIdx = cleaned.indexOf('{');
        const endIdx = cleaned.lastIndexOf('}');
        
        if (startIdx !== -1 && endIdx !== -1) {
          evaluation = JSON.parse(cleaned.substring(startIdx, endIdx + 1));
        }
      } catch (e) {
        console.error('JSON Parse Failed, using fallback. Raw:', aiResponse.substring(0, 200));
      }
    } else {
      console.warn('AI Response was empty, using fallback report.');
    }

    // 4. Save Report to DB
    const report = await Report.create({
      sessionId,
      userId: req.user._id,
      overallScore: evaluation.overallScore || 0,
      metrics: evaluation.metrics || fallback.metrics,
      strengths: evaluation.strengths || fallback.strengths,
      growth: evaluation.growth || fallback.growth,
      suggestedTopics: evaluation.suggestedTopics || fallback.suggestedTopics
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
