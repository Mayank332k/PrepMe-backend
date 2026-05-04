const axios = require('axios');
const { getSummarizerPrompt, getResumeParsingPrompt } = require('./prompts');

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_MODEL = process.env.SARVAM_MODEL_NAME;

const sarvamApi = axios.create({
  baseURL: 'https://api.sarvam.ai/v1',
  headers: {
    'api-subscription-key': SARVAM_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 1 minute timeout for long reports/transcripts
});

/**
 * Generate AI Response based on context and message
 */
async function getAIResponse(messages, systemPrompt) {
  try {
    const response = await sarvamApi.post('/chat/completions', {
      model: SARVAM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.2,
      max_tokens: 3000,
    });

    const content = response.data?.choices?.[0]?.message?.content || null;
    console.log(`[AI Response] Received ${content ? content.length : 0} characters.`);
    if (content) console.log(`[AI Raw Snippet] ${content.substring(0, 150)}...`);
    
    return content;
  } catch (error) {
    console.error('Sarvam AI Error:', error.response?.data || error.message);
    throw new Error('AI Service is currently unavailable.');
  }
}

/**
 * Generate a streaming AI response
 */
async function getStreamingAIResponse(messages, systemPrompt) {
  try {
    console.log(`[AI Stream] Sending request to Sarvam. Messages: ${messages.length}, SystemPrompt Snippet: ${systemPrompt.substring(0, 100)}...`);
    
    const response = await sarvamApi.post('/chat/completions', {
      model: SARVAM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.1,
      max_tokens: 2000,
      stream: true,
    }, {
      responseType: 'stream'
    });

    return response.data;
  } catch (error) {
    console.error('Sarvam Streaming Error:', error.response?.data || error.message);
    throw new Error('Streaming service unavailable.');
  }
}

/**
 * Specifically parses resume text into structured Profile JSON
 */
async function parseResumeWithAI(resumeText) {
  const prompt = getResumeParsingPrompt(resumeText);

  try {
    console.log('[AI Resume Parsing] Sending text to AI for structured JSON...');
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
    console.log('[Summarizer] Requesting updated summary from AI...');
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

