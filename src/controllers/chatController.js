const Session = require('../models/Session');
const { getAIResponse, getStreamingAIResponse } = require('../utils/aiService');

exports.handleChat = async (req, res) => {
  const { sessionId } = req.params;
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ message: 'Message content cannot be empty.' });
  }

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
      # Role: Technical Interviewer
      Simulate a REAL-LIFE technical interview that starts with fundamentals.

      # Context
      - Target Job: ${session.jobDescription || "N/A"}
      - Candidate Profile: ${JSON.stringify(session.profileJson || {})}
      - Resume Reference: ${session.resumeText.substring(0, 1500)} 

      # Interview Phases (STRICT SEQUENTIAL ORDER)
      
      ## Phase 1: Tech Stack & Choice (1-2 questions)
      - "Why MERN?" or "What made you choose Node.js over other backend tech?"

      ## Phase 2: CS Fundamentals - OOPS & Basic DSA (2-3 questions)
      - **OOPS**: Ask about Classes, Inheritance, Encapsulation, or Polymorphism in JS context.
      - **DSA**: Ask basic logic questions (e.g., Array manipulation, String reversal, or how a specific Data Structure like a Map/Set works).

      ## Phase 3: Programming Language (JavaScript) (2-3 questions)
      - **Core JS**: Closures, Event Loop, Promises, Async/Await, Prototypes.
      - *CRITICAL*: Do NOT move ahead until JS fundamentals are clear.

      ## Phase 4: Framework (React) (2-3 questions)
      - **React**: Hooks (useEffect, useMemo, etc.), Virtual DOM, Props vs State.

      ## Phase 5: Projects & Practical Implementation (ONLY AT THE END)
      - Only now ask about "PrepMe" or "How you designed your DB".
      - **NO System Design** or **Architecture** questions before this phase.

      # Core Rules (MANDATORY)
      1. **Strict Sequencing**: You are FORBIDDEN from jumping to Phase 5 before completing Phases 1-4.
      2. **One at a Time**: Only ONE specific technical question per message.
      3. **Evaluation**: 70% of the interview should be about Fundamentals (Phases 1-4).
      4. **Conversational**: If they give a short answer, dig deeper into the "How" or "Why".
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
      console.log(`[Chat] Stream ended. Total content length: ${fullContent.length}`);
      
      // 6. Save Full AI Response to Transcript
      const finalAIContent = fullContent.trim() || "I'm sorry, I'm having trouble processing that right now. Could you please try rephrasing or asking something else?";
      
      session.transcript.push({
        role: 'assistant',
        content: finalAIContent
      });
      
      try {
        // Double check all transcript items before saving to prevent validation crash
        session.transcript = session.transcript.map(item => ({
          role: item.role,
          content: item.content || "..." // Last resort fallback
        }));

        await session.save();
        console.log(`[Chat] Session ${sessionId} saved successfully.`);
      } catch (saveError) {
        console.error('[Chat] Mongoose Save Error Details:', JSON.stringify(saveError.errors, null, 2));
        // If it still fails, try one last time with a stripped down transcript
        if (!res.headersSent) {
           console.log("[Chat] Attempting emergency save...");
        }
      }

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


exports.getHint = async (req, res) => {
  const { sessionId } = req.params;
  const { messageHistory } = req.body;

  try {
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    const history = session.transcript.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Sirf last 2-3 important exchanges nikalna context ke liye
    // Thoda zyada history (last 6 messages) for better context
    const lastContext = history.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

    const hintPrompt = `
      You are a technical interview assistant. 
      The candidate is stuck. Your task is to provide a "Conceptual Bridge" that brings them significantly closer to the answer without revealing it entirely.

      # Context
      - Job: ${session.jobDescription || "N/A"}
      - Context: ${session.resumeText.substring(0, 500)}

      # Last Exchange
      ${lastContext}

      # Task (CRITICAL)
      1. Analyze the last question asked by the interviewer.
      2. Provide a directional hint that points to the core logic or technical concept needed.
      3. **Strictly NO counter-questions.** Do not ask "Have you thought about...?" or "What do you think?".
      4. Speak in a helpful, informative tone. Give a clue like: "Focus on how **[Concept]** manages **[Specific Detail]**." or "Think about using a **[Data Structure]** to optimize the lookup."

      # Rules
      - Max 25 words.
      - Use **bold** for the key technical part.
      - No introductory text.
    `;

    // Empty array bhej rahe hain taaki AI sirf hamare formatted prompt par focus kare
    const hint = await getAIResponse([], hintPrompt);
    res.status(200).json({ success: true, hint });

  } catch (error) {
    console.error('Hint Error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate hint.' });
  }
};

exports.getSession = async (req, res) => {
  const { sessionId } = req.params;
  try {
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    if(session.status === "completed"){
      return res.status(200).json({
        success: true,
        message: "Interview completed successfully!"
      });
    }

    res.status(200).json({
      success: true,
      session: {
        id: session._id,
        status: session.status,
        transcript: session.transcript,
        jobTitle: session.jobDescription
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};