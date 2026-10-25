const axios = require('axios');
const {
  getSummarizerPrompt,
  getResumeParsingPrompt,
  getResumeTranscriptionPrompt,
} = require('./prompts');

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

// Chat model used for interview questions, feedback and history summarization.
// gpt-oss-20b is a reasoning model. With the default effort it can spend
// 300-1500 tokens thinking before the first visible token (~4-9s); `low` cuts
// that to ~50 tokens (~1.4s) while keeping answer quality.
const CHAT_MODEL = 'openai/gpt-oss-20b';
const CHAT_REASONING_EFFORT = 'low';

// Resume parsing and report generation need strict JSON output, so they keep
// the default (full) reasoning budget instead of the chat latency shortcut.
const PARSING_MODEL = 'openai/gpt-oss-20b';

if (!NVIDIA_API_KEY) {
  console.warn('[AI Service] NVIDIA_API_KEY is not set - AI calls will fail.');
}

const http = require('http');
const https = require('https');

const nvidiaApi = axios.create({
  baseURL: NVIDIA_BASE_URL,
  headers: {
    'Authorization': `Bearer ${NVIDIA_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 60000,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Vision fallback (scanned / image-only PDFs)
// ─────────────────────────────────────────────────────────────────────────────

// Models are tried in order. nemotron-parse is purpose-built for documents and
// returns layout blocks through a tool call; llama-3.2-vision is the fallback
// and returns plain text. Both only accept one image per request.
const DEFAULT_VISION_MODEL_CHAIN = [
  'nvidia/nemotron-parse',
  'meta/llama-3.2-11b-vision-instruct',
];

// Per-model quirks: output budget, whether a text prompt may be attached, and
// how the transcription comes back.
const VISION_MODEL_PROFILES = {
  'nvidia/nemotron-parse': {
    maxTokens: 3072,
    supportsTextPrompt: false, // rejects any text part in the content array
    responseFormat: 'bbox-tool', // returns text via a markdown_bbox tool call
  },
  'meta/llama-3.2-11b-vision-instruct': {
    maxTokens: 1536,
    supportsTextPrompt: true,
    responseFormat: 'text',
  },
  'meta/llama-3.2-90b-vision-instruct': {
    maxTokens: 1536,
    supportsTextPrompt: true,
    responseFormat: 'text',
  },
  'nvidia/nemotron-3.5-super-vl-120b-a12b': {
    maxTokens: 4096, // reasoning model, needs headroom
    supportsTextPrompt: true,
    responseFormat: 'text',
  },
};

const DEFAULT_VISION_PROFILE = {
  maxTokens: 2048,
  supportsTextPrompt: true,
  responseFormat: 'text',
};

const getVisionProfile = (model) => VISION_MODEL_PROFILES[model] || DEFAULT_VISION_PROFILE;

const configuredVisionModels = (
  process.env.NVIDIA_VISION_MODELS ||
  process.env.NVIDIA_VISION_MODEL ||
  ''
)
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);

const VISION_MODEL_CHAIN = configuredVisionModels.length > 0
  ? configuredVisionModels
  : DEFAULT_VISION_MODEL_CHAIN;

// Hard wall-clock cap per request. axios' own timeout only measures socket
// inactivity, which never fires while a slow model is still streaming tokens.
// 60s is ~4x the observed time for a resume page; the worst case is
// (primary + fallback) x this value, so keeping it tight protects the request.
const VISION_TIMEOUT_MS = Number(process.env.NVIDIA_VISION_TIMEOUT_MS) || 60000;

const nvidiaVisionApi = axios.create({
  baseURL: NVIDIA_BASE_URL,
  headers: {
    'Authorization': `Bearer ${NVIDIA_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: VISION_TIMEOUT_MS,
  maxBodyLength: 30 * 1024 * 1024,
  maxContentLength: 30 * 1024 * 1024,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
});

const describeVisionError = (error) => {
  const status = error.response?.status;
  const detail =
    error.response?.data?.detail ||
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    error.message;
  return `${status || 'network'} - ${detail}`;
};

/**
 * Generate AI Response based on context and message
 */
async function getAIResponse(messages, systemPrompt, maxTokens = 2048, model = CHAT_MODEL) {
  const request = (budget) => nvidiaApi.post('/chat/completions', {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    temperature: 0.2,
    max_tokens: budget,
    top_p: 0.7,
  });

  try {
    let budget = maxTokens;
    let response = await request(budget);
    let choice = response.data?.choices?.[0];

    // Reasoning models such as gpt-oss spend the budget on reasoning_content
    // first, so a tight max_tokens can return content: null with
    // finish_reason "length". One retry with more room recovers the answer.
    if (!choice?.message?.content && choice?.finish_reason === 'length') {
      console.warn(
        `[NVIDIA Response] Empty content with finish_reason "length" (budget ${budget}). Retrying with ${budget * 2}.`,
      );
      budget *= 2;
      response = await request(budget);
      choice = response.data?.choices?.[0];
    }

    const content = choice?.message?.content || null;
    console.log(`[NVIDIA Response] Received ${content ? content.length : 0} characters.`);
    if (content) console.log(`[NVIDIA Raw Snippet] ${content.substring(0, 150)}...`);

    if (!content) {
      console.warn(
        `[NVIDIA Response] No content returned (finish_reason: ${choice?.finish_reason}). Try a higher max_tokens or a non-reasoning PARSING_MODEL.`,
      );
    } else if (choice.finish_reason === 'length') {
      console.warn(`[NVIDIA Response] Response truncated at ${budget} tokens; output may be incomplete.`);
    }

    return content;
  } catch (error) {
    console.error('NVIDIA AI Error:', error.response?.data || error.message);
    throw new Error('AI Service is currently unavailable.');
  }
}

/**
 * Generate a streaming AI response
 */
async function getStreamingAIResponse(messages, systemPrompt, maxTokens = 1000, model = CHAT_MODEL) {
  try { 
    const response = await nvidiaApi.post('/chat/completions', {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
      top_p: 0.7,
      stream: true,
      reasoning_effort: CHAT_REASONING_EFFORT,
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
 * nemotron-parse returns layout blocks as a tool call:
 *   [[{ bbox, text, type }, ...]]  (sometimes nested one level deeper)
 * Only the text matters here, and the blocks are already in reading order.
 */
function extractTextFromToolCalls(toolCalls) {
  const texts = [];

  for (const call of toolCalls) {
    const raw = call?.function?.arguments;
    if (!raw) continue;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.warn('[Vision] Could not parse tool call arguments.');
      continue;
    }

    for (const block of [parsed].flat(Infinity)) {
      if (block && typeof block === 'object' && typeof block.text === 'string') {
        const text = block.text.trim();
        if (text) texts.push(text);
      }
    }
  }

  return texts.join('\n');
}

/**
 * Transcribe a single rendered PDF page with one vision model.
 * Returns the text plus the metrics needed for latency/cost logging.
 */
async function transcribeSinglePage(model, imageBuffer) {
  const startedAt = Date.now();
  const profile = getVisionProfile(model);

  const content = [];
  if (profile.supportsTextPrompt) {
    content.push({ type: 'text', text: getResumeTranscriptionPrompt() });
  }
  content.push({
    type: 'image_url',
    image_url: {
      url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
    },
  });

  const response = await nvidiaVisionApi.post(
    '/chat/completions',
    {
      model,
      messages: [{ role: 'user', content }],
      temperature: 0,
      max_tokens: profile.maxTokens,
    },
    { signal: AbortSignal.timeout(VISION_TIMEOUT_MS) },
  );

  const message = response.data?.choices?.[0]?.message;
  const usage = response.data?.usage || {};

  let text = '';
  if (message) {
    if (profile.responseFormat === 'bbox-tool') {
      text = extractTextFromToolCalls(message.tool_calls || []);
    }
    if (!text.trim()) text = message.content || '';
  }

  return {
    text,
    model,
    durationMs: Date.now() - startedAt,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
  };
}

const logVisionPage = (pageNumber, result, note = '') => {
  console.log(
    `[Vision] page=${pageNumber} model=${result.model} ms=${result.durationMs} chars=${result.text.length} ` +
      `promptTokens=${result.promptTokens ?? '?'} completionTokens=${result.completionTokens ?? '?'}` +
      (note ? ` (${note})` : ''),
  );
};

/**
 * Transcribes rendered resume pages using a vision model chain.
 * The first page probes which model is actually usable, then the remaining
 * pages are sent in parallel (with per-page model fallback).
 *
 * @param {Buffer[]} images JPEG buffers, one per page
 * @returns {Promise<string>} combined transcription
 */
async function transcribeResumeImages(images) {
  const startedAt = Date.now();

  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('No page images were provided for transcription.');
  }

  const results = new Array(images.length).fill(null);
  let activeModel = null;

  for (const model of VISION_MODEL_CHAIN) {
    try {
      const result = await transcribeSinglePage(model, images[0]);
      if (result.text.trim()) {
        activeModel = model;
        results[0] = result;
        logVisionPage(1, result);
        break;
      }
      console.warn(
        `[Vision] model=${model} returned empty text (${result.durationMs}ms)`,
      );
    } catch (error) {
      console.warn(`[Vision] model=${model} unavailable: ${describeVisionError(error)}`);
    }
  }

  if (!activeModel) {
    throw new Error('No configured vision model could read the document.');
  }

  const remaining = await Promise.all(
    images.slice(1).map(async (image, index) => {
      const pageNumber = index + 2;

      try {
        const result = await transcribeSinglePage(activeModel, image);
        if (result.text.trim()) return result;
        console.warn(
          `[Vision] page=${pageNumber} model=${activeModel} returned empty text (${result.durationMs}ms), trying fallback models`,
        );
      } catch (error) {
        console.warn(
          `[Vision] page=${pageNumber} model=${activeModel} failed: ${describeVisionError(error)}`,
        );
      }

      for (const model of VISION_MODEL_CHAIN) {
        if (model === activeModel) continue;
        try {
          const result = await transcribeSinglePage(model, image);
          if (result.text.trim()) return result;
        } catch (fallbackError) {
          console.warn(
            `[Vision] page=${pageNumber} fallback=${model} failed: ${describeVisionError(fallbackError)}`,
          );
        }
      }

      return null;
    }),
  );

  remaining.forEach((result, index) => {
    results[index + 1] = result;
    if (result) logVisionPage(index + 2, result);
  });

  const combined = results
    .map((result) => result?.text.trim() || '')
    .filter(Boolean)
    .join('\n\n');

  if (!combined) {
    throw new Error('Vision transcription came back empty.');
  }

  const promptTokens = results.reduce((sum, result) => sum + (result?.promptTokens || 0), 0);
  const completionTokens = results.reduce(
    (sum, result) => sum + (result?.completionTokens || 0),
    0,
  );

  console.log(
    `[Vision] done pages=${results.filter((result) => result?.text.trim()).length}/${images.length} ` +
      `model=${activeModel} totalMs=${Date.now() - startedAt} ` +
      `promptTokens=${promptTokens} completionTokens=${completionTokens}`,
  );

  return combined;
}

/**
 * Specifically parses resume text into structured Profile JSON
 */
async function parseResumeWithAI(resumeText) {
  const prompt = getResumeParsingPrompt(resumeText);

  try {
    console.log('[AI Resume Parsing] Sending text to NVIDIA for structured JSON...');
    const response = await getAIResponse(
      [{ role: 'user', content: prompt }],
      "You are a specialized Resume-to-JSON extractor.",
      4096,
      PARSING_MODEL
    );
    
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
    return { success: true, summary };
  } catch (error) {
    console.error('Summarization Error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getAIResponse,
  getStreamingAIResponse,
  summarizeHistory,
  parseResumeWithAI,
  transcribeResumeImages,
};


