# 🚀 PrepMe - AI-Powered Technical Interview Platform

PrepMe is a full stack MERN application that helps users prepare for technical interviews through AI-driven mock interview sessions, resume analysis, and performance tracking.

The platform uses NVIDIA NIM (build.nvidia.com) to generate context-aware interview questions and feedback based on the candidate’s resume and interview responses.

---

# ✨ Features

- AI-powered resume analysis and skill extraction
- Context-aware mock interview sessions
- Session-based conversation summarization for optimized AI token usage
- Performance analytics and interview history tracking
- Authentication using Google OAuth 2.0 and JWT
- Resume upload and parsing workflows
- Scanned / image-only resume PDFs read via a vision-model fallback
- Responsive UI optimized for desktop and mobile devices
- Persistent interview sessions and progress tracking

---

# 🛠️ Tech Stack

## Frontend
- React.js
- CSS Modules
- Recharts

## Backend
- Node.js
- Express.js

## Database
- MongoDB
- Mongoose

## Authentication
- JWT
- Google OAuth 2.0

## AI Integration
- NVIDIA NIM API (OpenAI-compatible `/chat/completions`)

---

# ⚙️ System Design Highlights

- RESTful API architecture
- Modular MVC backend structure
- Session management and authentication middleware
- Optimized AI request handling and token management
- Scalable MongoDB schema design
- Environment-based configuration handling

---

# 🚀 Getting Started

## Prerequisites

- Node.js v16+
- MongoDB Atlas or local MongoDB instance
- Google Cloud Console account
- NVIDIA Developer Program account (free) for a NIM API key

---

# 📦 Installation

## Clone Repository

```bash
git clone https://github.com/Mayank332k/PrepMe.git
cd PrepMe
```

---

## Backend Setup

```bash
cd PrepMe-backend
npm install
```

Create a `.env` file:

```env
PORT=5001
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_secret
GOOGLE_CLIENT_ID=your_google_id
GOOGLE_CLIENT_SECRET=your_google_secret
FRONTEND_URL=http://localhost:5173
NVIDIA_API_KEY=your_nvidia_nim_key

# Optional overrides (defaults shown)
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1

# Scanned PDF fallback (vision transcription)
NVIDIA_VISION_MODELS=nvidia/nemotron-parse,meta/llama-3.2-11b-vision-instruct
NVIDIA_VISION_TIMEOUT_MS=60000
PDF_VISION_MAX_PAGES=3
```

Get a free key at <https://build.nvidia.com> - no credit card required.

Run backend server:

```bash
npm run dev
```

---

## AI Models

Both models are hardcoded in `src/utils/aiService.js` (no env override):

- `CHAT_MODEL` = `nvidia/nemotron-3.5-bolt-e4b` - chat, feedback and history summarization
- `PARSING_MODEL` = `openai/gpt-oss-20b` - resume-to-JSON extraction

`NVIDIA_BASE_URL` remains configurable if you need to point at a self-hosted NIM endpoint.

`bolt-e4b` is a small non-reasoning model and streams its first token in ~0.4s on the free tier, which is what the chat UI feels. `gpt-oss-20b` is a reasoning model: it spends part of `max_tokens` on hidden reasoning before writing an answer, so it is kept only for parsing, where accuracy matters more than latency. `getAIResponse` detects the `finish_reason: "length"` + `content: null` case, retries once with double the budget, and logs a warning if it still comes back empty.

Latency was measured on the free tier, where it varies a lot per request. Note that most entries in the NVIDIA catalog return 404 for a given account even though `/models` lists them.

The NVIDIA developer tier is free: roughly 1,000 credits on signup (~1 credit per call) and ~40 requests/minute, account-wide.

---

## Frontend Setup

```bash
cd PrepMe
npm install
```

Create a `.env` file:

```env
VITE_API_URL=http://localhost:5001/api
VITE_GOOGLE_CLIENT_ID=your_google_id
```

Run frontend:

```bash
npm run dev
```

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push to your branch
5. Open a Pull Request

---

# 📄 License

Distributed under the MIT License.

---

Built by Mayank Singh
