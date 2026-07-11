const mongoose = require("mongoose");
const fs = require("fs");
const app = require("./app");

const PORT = process.env.PORT || 3000;
const DB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/prepme";

// MongoDB connection pooling
const mongoOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

mongoose
  .connect(DB_URI, mongoOptions)
  .then(() => {
    console.log("✅ MongoDB Connected");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Database Connection Error:", err.message);
  });
