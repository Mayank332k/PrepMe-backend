const Session = require('../models/Session');
const { getAIResponse } = require('../utils/aiService');

exports.handleChat = async (req, res) => {
  const { sessionId } = req.params;
  const { message } = req.body;

  try {
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    if (session.status === 'completed') {
      return res.status(400).json({ message: 'This interview has already finished.' });
    }

    // 1. Add User Message to Transcript
    session.transcript.push({
      role: 'user',
      content: message
    });

    const history = session.transcript.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // 3. Construct System Prompt with Resume Context
    const systemPrompt = `
      You are a Senior Technical Interviewer. 
      
      JOB DESCRIPTION: ${session.jobDescription || 'Not provided'}
      
      RESUME SUMMARY: ${JSON.stringify(session.profileJson || {})}
      
      FULL RESUME TEXT:
      ${session.resumeText}

      INSTRUCTIONS:
      1. Ask ONLY ONE question at a time.
      2. Briefly judge the user's previous answer (e.g., "Good explanation," or "That's partially correct") before asking the next one.
      3. Ask counter-questions if the user's answer is vague or weak.
      4. Methodically cover different sections of the resume (Skills, Experience, Projects). Use the FULL RESUME TEXT for detailed technical questions.
      5. Align your questions with the JOB DESCRIPTION if provided.
      6. If the interview is logically concluding, say "Thank you, we're done."
      7. Keep your response to 3-5 lines maximum.
      8. Do not repeat questions.
      9. Avoid asking about too many topics in one go. Ask one question at a time.
      11. Do not ask any irrelevant questions.
      12. Do not grasp for too much detail in the answers if the user has already given a detailed answer.
      13.Dont skip any kind question
      13. try to cover all the topics mentioned in the resume.

    `;

    // 4. Get AI Response with full history
    const aiMessage = await getAIResponse(history, systemPrompt);

    // 5. Save AI Response to Transcript
    session.transcript.push({
      role: 'assistant',
      content: aiMessage
    });

    await session.save();

    res.json({
      reply: aiMessage,
      status: session.status
    });

  } catch (error) {
    console.error('Chat Error:', error.message);
    res.status(500).json({ message: 'Error communicating with AI.' });
  }
};
