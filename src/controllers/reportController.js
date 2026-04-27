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

    let conversation = session.transcript.map(m => `${m.role[0]}: ${m.content}`).join('\n');
    if (conversation.length > 5000) conversation = '...' + conversation.slice(-5000);

    // 2. Fair but Realistic AI Evaluator Prompt
    const evaluationPrompt = `
      # Role: AI Interview Evaluator
      Evaluate the transcript FAIRLY and REALISTICALLY based on what the candidate actually said.

      IMPORTANT RULES:
      - If the candidate participated and answered questions, they MUST get a score above 0.
      - Score based on ACTUAL performance, not perfection. A basic but correct answer deserves 30-50.
      - Only give 0 if the candidate was completely silent or gave zero relevant answers for that metric.
      - DO NOT assume skills from the resume. Evaluate ONLY what was said in the transcript.

      # Scoring Bands (0-100 scale for each metric)
      - 0-10:   Completely silent or irrelevant responses.
      - 11-30:  Attempted answers but very surface-level, vague, or mostly incorrect.
      - 31-50:  Basic understanding shown, mentioned correct tools/concepts but lacked depth.
      - 51-70:  Solid answers with some depth, examples, or reasoning.
      - 71-85:  Strong answers with clear explanations, trade-offs, and practical knowledge.
      - 86-100: Exceptional depth, internals knowledge, edge cases, and real-world insights.

      # Metrics
      1. Technical Depth (40% weight): Did they explain HOW things work? Did they name specific tools, libraries, or patterns? Did they show understanding beyond surface level?
      2. Problem Solving (30% weight): Did they demonstrate logical thinking, trade-off analysis, or debugging mindset? Even describing their approach counts.
      3. Communication (20% weight): Were their answers structured and clear? Did they respond coherently? Even short clear answers score here.
      4. Confidence (10% weight): Did they answer with certainty? Did they admit gaps honestly (which is also good)? Hesitation or uncertainty lowers this.

      # Scoring Calculation
      OverallScore = Round((TechDepth * 0.4) + (ProblemSolving * 0.3) + (Communication * 0.2) + (Confidence * 0.1))

      # Content Rules
      - Strengths: What the candidate ACTUALLY demonstrated well. Max 5 short phrases.
      - AreasForGrowth: Specific weak points or missed opportunities. Max 5 specific points.
      - SuggestedTopics: Topics they should study based on their weaknesses. Max 5 items.
      - No resume assumptions. No motivational fluff. Be specific and actionable.

      # Transcript to Evaluate:
      ${conversation}

      # Output ONLY valid JSON (no extra text):
      {
        "overallScore": <number 0-100>,
        "metrics": {
          "technicalDepth": <number 0-100>,
          "communication": <number 0-100>,
          "problemSolving": <number 0-100>,
          "confidence": <number 0-100>
        },
        "strengths": ["<string>", ...],
        "areasForGrowth": ["<string>", ...],
        "suggestedTopics": ["<string>", ...]
      }
    `;

    // 3. Get AI Evaluation
    const aiResponse = await getAIResponse([{ role: 'user', content: evaluationPrompt }], "You are a fair interview evaluator. Return ONLY valid JSON. Score based on actual candidate performance — never give all zeros if the candidate participated.");

    const fallback = {
      overallScore: 50,
      metrics: { technicalDepth: 50, communication: 50, problemSolving: 50, confidence: 50 },
      strengths: ["Interview completed"],
      areasForGrowth: ["Provide more detailed answers"],
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
    }

    // 4. Save Report to DB
    const report = await Report.create({
      sessionId,
      userId: req.user._id,
      overallScore: Math.round(evaluation.overallScore || 0),
      metrics: evaluation.metrics || fallback.metrics,
      strengths: evaluation.strengths || fallback.strengths,
      areasForGrowth: evaluation.areasForGrowth || fallback.areasForGrowth,
      suggestedTopics: evaluation.suggestedTopics || fallback.suggestedTopics
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
