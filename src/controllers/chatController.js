const Session = require('../models/Session');
const { getAIResponse, getStreamingAIResponse, summarizeHistory } = require('../utils/aiService');
const { getInterviewerPrompt, getHintPrompt } = require('../utils/prompts');

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

    // 2. Optimized History: Send everything since the last summary
    // This ensures NO messages are skipped between the summary and the current window.
    const history = session.transcript.slice(session.lastSummarizedIndex).map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // 3. Construct System Prompt with Resume Context
    const systemPrompt = getInterviewerPrompt(session);

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

        // 7. Background Rolling Summarization
        // Threshold: 15 live messages. If reached, merge first 10 into summary.
        const liveMessagesCount = session.transcript.length - session.lastSummarizedIndex;
        if (liveMessagesCount >= 15) {
          console.log(`[Summarizer] Triggering summary update for session ${sessionId}...`);
          
          // Merge first 11 messages, leaving exactly 4 recent ones (15 - 11 = 4)
          const messagesToMerge = session.transcript.slice(
            session.lastSummarizedIndex, 
            session.lastSummarizedIndex + 11
          );

          // We don't 'await' this to avoid blocking the user experience (background task)
          summarizeHistory(session.summary, messagesToMerge).then(async (newSummary) => {
            if (newSummary) {
              await Session.findByIdAndUpdate(sessionId, {
                $set: { 
                  summary: newSummary,
                  lastSummarizedIndex: session.lastSummarizedIndex + 11
                }
              });
              console.log(`[Summarizer]  =====Summary updated for session== ${sessionId}.`);
            }
          }).catch(err => console.error('[Summarizer] Failed to update summary:', err));
        }

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

    const hintPrompt = getHintPrompt(session, lastContext);

    // Empty array bhej rahe hain taaki AI sirf hamare formatted prompt par focus kare
    let hint = await getAIResponse([], hintPrompt);

    if (!hint || hint.trim() === "") {
      hint = "*Try connecting this concept to the core architecture of your primary project.*";
    }

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