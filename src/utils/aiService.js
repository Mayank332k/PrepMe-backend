const axios = require('axios');

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_MODEL = process.env.SARVAM_MODEL_NAME || 'sarvam-105b';

const sarvamApi = axios.create({
  baseURL: 'https://api.sarvam.ai/v1',
  headers: {
    'api-subscription-key': SARVAM_API_KEY,
    'Content-Type': 'application/json',
  },
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
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response.data?.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('Sarvam AI Error:', error.response?.data || error.message);
    throw new Error('AI Service is currently unavailable.');
  }
}

/**
 * Specifically parses resume text into structured Profile JSON
 */
async function parseResumeWithAI(resumeText) {
  const prompt = `
    Analyze this resume and extract details in STRICT JSON format. 
    Resume Text: ${resumeText.substring(0, 4000)} 
    
    RESPONSE FORMAT:
    {
      "name": "Candidate Name",
      "summary": "Short professional summary",
      "topSkills": ["skill1", "skill2"],
      "experienceYears": 0,
      "strengths": ["strength1"]
    }

    STRICT RULES:
    1. ONLY return the JSON. No conversational text.
    2. Ensure the JSON is valid and all strings are closed.
    3. If something is missing, use "Not Specified".
  `;

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

module.exports = {
  getAIResponse,
  parseResumeWithAI
};
