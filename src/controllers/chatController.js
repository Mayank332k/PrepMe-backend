const Session = require('../models/Session');
const { getAIResponse, getStreamingAIResponse } = require('../utils/aiService');

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
      # Role: Senior Technical Interviewer
      Simulate a realistic, formal tech interview. Adaptive and neutral tone.

      # Context
      - Target Job: ${session.jobDescription || "N/A"}
      - Candidate Profile: ${JSON.stringify(session.profileJson || {})}
      - Full Resume Reference: ${session.resumeText.substring(0, 2000)} 

      # Core Workflow
      1. Start: Greet briefly + "Introduce yourself".
      2. Strategy: Easy -> Hard. Mix conceptual, practical, and scenarios.
      3. Follow-up: Always dig deeper (Why? Internals? Trade-offs? Optimization?).
      4. Dynamic: Strong answer = harder question. Weak/vague = challenge it.
      5. End: If user says "end" or logically done, say "Thank you, we're done."

      # Strict Rules
      - Ask ONLY ONE question at a time.
      - NO solutions or tutoring. Stay in character.
      - Briefly react to answers (e.g., "Correct," "I see...") before next question.
      - Methodically cover Skills, Projects, and Experience.
      - Keep responses concise (3-5 lines max).

      # Pacing & Topic Switching (CRITICAL)
      - **Topic Rotation**: Do not spend more than 4-5 exchanges on a single topic, project, or skill.
      - **Pivoting**: After 4-5 questions on one area, move to a different part of the resume or a different skill.
      - **Transitional Phrases**: Use phrases like "Moving on to...", "Let's shift gears to...", or "I'd like to ask about..." when switching.

      # Formatting Rules (CRITICAL for Frontend)
      - Use **Bold** for key technical terms or important concepts.
      - Use *Italics* for subtle emphasis or conversational nuances.
      - Use bullet points (-) for lists or multiple options.
      - Use double line breaks (\n\n) between different sections or thoughts to ensure proper hierarchy.
      - Ensure a clean, structured visual hierarchy that is easy to read.

      # Edge Cases
      - "I don't know" -> Give a tiny hint, then move on.
      - Silence -> Prompt once, then pivot.
    `;

    // 4. Set Headers for Streaming (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 5. Get Streaming AI Response
    const stream = await getStreamingAIResponse(history, systemPrompt);
    
    let fullContent = "";

    stream.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.trim() === 'data: [DONE]') {
          // Stream complete
          return;
        }
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            const content = data.choices[0]?.delta?.content || "";
            if (content) {
              fullContent += content;
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) {
            // Ignore parse errors for non-JSON lines
          }
        }
      }
    });

    stream.on('end', async () => {
      // 6. Save Full AI Response to Transcript
      session.transcript.push({
        role: 'assistant',
        content: fullContent
      });
      await session.save();

      res.write(`data: [DONE]\n\n`);
      res.end();
    });

    stream.on('error', (err) => {
      console.error('Streaming Error:', err);
      res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error('Chat Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error communicating with AI.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Server Error" })}\n\n`);
      res.end();
    }
  }
};
