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
      You are an expert technical interviewer. 
      CANDIDATE RESUME: ${session.resumeText}
      
      YOUR GOAL: 
      - Conduct a detailed interview based on the resume. 
      - Analyze the user's previous answers in the conversation history.
      - Do NOT repeat questions. 
      - Ask follow-up questions if an answer is weak.
      - Be professional and stay in character.
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
