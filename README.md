# 🚀 PrepMe - AI-Powered Technical Interview Platform

PrepMe is a full stack MERN application that helps users prepare for technical interviews through AI-driven mock interview sessions, resume analysis, and performance tracking.

The platform uses Google Gemini AI to generate context-aware interview questions and feedback based on the candidate’s resume and interview responses.

---

# ✨ Features

- AI-powered resume analysis and skill extraction
- Context-aware mock interview sessions
- Session-based conversation summarization for optimized AI token usage
- Performance analytics and interview history tracking
- Authentication using Google OAuth 2.0 and JWT
- Resume upload and parsing workflows
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
- Google Gemini AI API

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
- Gemini AI API key

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
cd backend
npm install
```

Create a `.env` file:

```env
PORT=5001
MONGODB_URI=your_mongodb_uri
GEMINI_API_KEY=your_gemini_key
JWT_SECRET=your_secret
GOOGLE_CLIENT_ID=your_google_id
```

Run backend server:

```bash
npm run dev
```

---

## Frontend Setup

```bash
cd frontend
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
