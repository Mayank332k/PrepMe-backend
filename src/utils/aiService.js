const axios = require('axios');
const { getSummarizerPrompt, getResumeParsingPrompt } = require('./prompts');

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_MODEL = "meta/llama-4-maverick-17b-128e-instruct";

const nvidiaApi = axios.create({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  headers: {
    'Authorization': `Bearer ${NVIDIA_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 60000, 
});

/**
 * Generate AI Response based on context and message
 */
async function getAIResponse(messages, systemPrompt) {
  try {
    const response = await nvidiaApi.post('/chat/completions', {
      model: NVIDIA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.2,
      max_tokens: 3000,
      top_p: 0.7,
    });

    const content = response.data?.choices?.[0]?.message?.content || null;
    console.log(`[NVIDIA Response] Received ${content ? content.length : 0} characters.`);
    if (content) console.log(`[NVIDIA Raw Snippet] ${content.substring(0, 150)}...`);
    
    return content;
  } catch (error) {
    console.error('NVIDIA AI Error:', error.response?.data || error.message);
    throw new Error('AI Service is currently unavailable.');
  }
}

/**
 * Generate a streaming AI response
 */
async function getStreamingAIResponse(messages, systemPrompt) {
  try {
    console.log(`[NVIDIA Stream] Sending request to NVIDIA. Messages: ${messages.length}, SystemPrompt Snippet: ${systemPrompt.substring(0, 100)}...`);
    
    const response = await nvidiaApi.post('/chat/completions', {
      model: NVIDIA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.1,
      max_tokens: 2000,
      top_p: 0.7,
      stream: true,
    }, {
      responseType: 'stream',
      headers: {
        'Accept': 'text/event-stream'
      }
    });

    return response.data;
  } catch (error) {
    console.error('NVIDIA Streaming Error:', error.response?.data || error.message);
    throw new Error('Streaming service unavailable.');
  }
}

/**
 * Specifically parses resume text into structured Profile JSON
 */
async function parseResumeWithAI(resumeText) {
  const prompt = getResumeParsingPrompt(resumeText);

  try {
    console.log('[AI Resume Parsing] Sending text to NVIDIA for structured JSON...');
    const response = await getAIResponse([{ role: 'user', content: prompt }], "You are a specialized Resume-to-JSON extractor.");
    
    console.log('[AI Service] Raw parsing response length:', response?.length);
    
    if (!response) {
      console.warn('[AI Service] AI returned empty response for parsing');
      return { name: "Candidate", rawText: "AI returned empty" };
    }

    // JSON nikalne ke liye smarter logic (find first { and last })
    const startIdx = response.indexOf('{');
    const endIdx = response.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1) {
      const jsonStr = response.substring(startIdx, endIdx + 1);
      try {
        return JSON.parse(jsonStr);
      } catch (innerErr) {
        console.warn('Incomplete JSON from AI. Using fallback.');
        return { name: "Candidate", rawText: "Malformed JSON" };
      }
    }
    
    throw new Error('No JSON object found in AI response');
  } catch (error) {
    console.error('Resume Parsing Error:', error.message);
    return { name: "Candidate", rawText: "Parsing Failed" }; 
  }
}

/**
 * Summarize a batch of messages and combine with previous summary
 */
async function summarizeHistory(oldSummary, newMessages) {
  const messagesToSummarize = newMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  const prompt = getSummarizerPrompt(oldSummary, messagesToSummarize);

  try {
    console.log('[Summarizer] Requesting updated summary from NVIDIA...');
    const summary = await getAIResponse([{ role: 'user', content: prompt }], "You are a concise summarizer.");
    console.log(`[Summarizer] Received new summary (${summary ? summary.length : 0} chars).`);
    console.log(`[Summarizer] NEW SUMMARY CONTENT:\n${summary}\n-------------------`);
    return summary;
  } catch (error) {
    console.error('Summarization Error:', error.message);
    return oldSummary; // Fallback to old summary if it fails
  }
}

module.exports = {
  getAIResponse,
  getStreamingAIResponse,
  summarizeHistory,
  parseResumeWithAI
};


