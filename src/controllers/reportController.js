const Session = require('../models/Session');
const Report = require('../models/Report');
const { getAIResponse } = require('../utils/aiService');
const { getReportPrompt } = require('../utils/prompts');

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
    const userMessages = session.transcript.filter(m => m.role === 'user');
    
    // If no user messages, return a zero report immediately
    if (userMessages.length === 0) {
      const zeroReport = await Report.create({
        sessionId,
        userId: req.user._id,
        overallScore: 0,
        metrics: { technicalDepth: 0, communication: 0, problemSolving: 0, confidence: 0 },
        strengths: ["None (No response provided)"],
        areasForGrowth: ["N/A (Interview not started)"],
        suggestedTopics: ["N/A"]
      });
      session.status = 'completed';
      await session.save();
      return res.status(201).json({ success: true, report: zeroReport });
    }

    // 2. Hybrid Context for Accuracy & Speed
    // Send the full summary (Past) + only un-summarized messages (Recent)
    const unsummarizedMessages = session.transcript.slice(session.lastSummarizedIndex || 0);
    const recentTranscript = unsummarizedMessages.map(m => `${m.role[0].toUpperCase()}: ${m.content}`).join('\n');
    
    console.log(`[Report] Context Stats - Summary Length: ${session.summary?.length || 0}, Recent Messages: ${unsummarizedMessages.length}`);

    const evaluationPrompt = getReportPrompt(recentTranscript, session.summary || '', session.jobDescription);

    // 3. Get AI Evaluation
    const aiResponse = await getAIResponse([{ role: 'user', content: evaluationPrompt }], "You are a strict, evidence-based interview evaluator. Return ONLY valid JSON.");

    console.log('[Report] Raw AI Evaluation Response:', aiResponse);

    if (!aiResponse || aiResponse.trim().length === 0) {
      console.error('[Report] AI returned empty response.');
      return res.status(502).json({ 
        success: false, 
        message: 'AI Service failed to evaluate the interview. Please try generating the report again in a few moments.' 
      });
    }

    let evaluation;
    try {
      // Robust JSON extraction
      const startIdx = aiResponse.indexOf('{');
      const endIdx = aiResponse.lastIndexOf('}');
      
      if (startIdx !== -1 && endIdx !== -1) {
        const jsonString = aiResponse.substring(startIdx, endIdx + 1);
        evaluation = JSON.parse(jsonString);
        console.log('[Report] JSON successfully parsed.');
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      console.error('[Report] JSON Parse Failed:', e.message);
      return res.status(422).json({ 
        success: false, 
        message: 'Failed to process AI evaluation. The response was not in a valid format. Please retry.' 
      });
    }

    // 4. Save Report to DB
    const report = await Report.create({
      sessionId,
      userId: req.user._id,
      overallScore: Math.round(evaluation.overallScore || 0),
      metrics: evaluation.metrics,
      phaseAnalysis: evaluation.phaseAnalysis,
      strengths: evaluation.strengths,
      areasForGrowth: evaluation.areasForGrowth,
      suggestedTopics: evaluation.suggestedTopics
    });

    // 5. Update Session status to completed
    session.status = 'completed';
    await session.save();

    res.status(201).json({
      success: true,
      report,
      transcript: session.transcript
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
    
    // Also fetch transcript from session
    const session = await Session.findById(req.params.sessionId).select('transcript');
    
    res.json({ 
      success: true, 
      report,
      transcript: session ? session.transcript : []
    });
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
