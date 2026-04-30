# 🚀 PrepMe - AI-Powered Technical Interview Platform

**PrepMe is an Open-Source project and anyone is free to use, modify, and contribute to it!**

PrepMe is a premium MERN stack application designed to help candidates master technical interviews. By leveraging the power of Gemini AI, PrepMe parses your resume and conducts interactive, context-aware interview sessions, providing detailed performance analytics and real-time feedback.

---

## ✨ Key Features

-   **AI Resume Analysis**: Smart extraction of skills and professional history from uploaded resumes.
-   **Interactive AI Interviews**: Real-time technical interview simulations tailored to your background.
-   **Performance Dashboard**: Visual trend graphs (using Recharts) tracking your progress over time.
-   **In-Depth Reports**: Comprehensive feedback on communication, technical depth, and confidence.
-   **Session Persistence**: Seamlessly resume ongoing interviews anytime.
-   **Premium UI/UX**: Fully responsive, minimalist design with smooth animations and tactile feedback.

---

## 🛠️ Tech Stack

-   **Frontend**: React.js, CSS Modules, Recharts, Material Symbols
-   **Backend**: Node.js, Express.js
-   **Database**: MongoDB (Mongoose)
-   **AI Engine**: Google Gemini AI API
-   **Authentication**: Google OAuth 2.0

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v16 or higher)
- MongoDB account (local or Atlas)
- Google Cloud Console account (for OAuth)
- Gemini AI API Key

### 2. Installation

**Clone the repository:**
```bash
git clone https://github.com/Mayank332k/PrepMe.git
cd PrepMe
```

**Setup Backend:**
1. Navigate to the backend folder.
2. Run `npm install`.
3. Create a `.env` file and add:
   ```env
   PORT=5001
   MONGODB_URI=your_mongodb_uri
   GEMINI_API_KEY=your_gemini_key
   JWT_SECRET=your_secret
   GOOGLE_CLIENT_ID=your_google_id
   ```
4. Run `npm run dev`.

**Setup Frontend:**
1. Navigate to the root/frontend folder.
2. Run `npm install`.
3. Create a `.env` file and add:
   ```env
   VITE_API_URL=http://localhost:5001/api
   VITE_GOOGLE_CLIENT_ID=your_google_id
   ```
4. Run `npm run dev`.

---

## 🤝 Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

**Built with ❤️ by [Mayank Singh](https://linkedin.com/in/mayank-singh-813b68373)**
