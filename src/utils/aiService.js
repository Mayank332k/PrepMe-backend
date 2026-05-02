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
});

/**
 * @param {Array} messages 
 * @param {string} systemPrompt 
 * @param {string} modelOverride 
 */
async function getAIResponse(messages, systemPrompt, modelOverride = null) {
  try {
    const response = await sarvamApi.post('/chat/completions', {
      model: modelOverride || SARVAM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    let content = response.data?.choices?.[0]?.message?.content || null;

    // Clean up internal thinking process if model returns <think>...</think> tags
    // temp fix for now..
    if (content) {
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    return content;
  } catch (error) {
    console.error('Sarvam AI Error:', error.response?.data || error.message);
    throw new Error('AI Service is currently unavailable.');
  }
}


async function getStreamingAIResponse(messages, systemPrompt) {
  try {
    const response = await sarvamApi.post('/chat/completions', {
      model: SARVAM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
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
    const response = await getAIResponse([{ role: 'user', content: prompt }], "You are a JSON generator.");
    
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
    const summary = await getAIResponse([{ role: 'user', content: prompt }], "You are a concise summarizer.");
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

