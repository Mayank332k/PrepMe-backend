const fs = require("fs");
const pdf = require("pdf-parse");
const Session = require("../models/Session");
const { parseResumeWithAI, getAIResponse } = require("../utils/aiService");
const { getOpeningGreetingPrompt } = require("../utils/prompts");

const User = require("../models/User");

exports.getUserResumeStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "resumeName resumeProfile",
    );
    res.status(200).json({
      success: true,
      hasResume: !!user.resumeName,
      resumeName: user.resumeName,
      profile: user.resumeProfile,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error checking resume status" });
  }
};

exports.ingestDocument = async (req, res) => {
  try {
    let resumeText;
    let resumeName;
    let profileJson;

    const user = await User.findById(req.user._id);

    if (req.file) {
      try {
        const pdfData = await pdf(req.file.buffer);
        resumeText = pdfData.text;
        resumeName = req.file.originalname;

        if (!resumeText || resumeText.trim().length === 0) {
          console.error("[Ingest] Empty text extracted from PDF");
          return res.status(422).json({
            success: false,
            message:
              "Could not extract text from the PDF. Please ensure it is not an image-only scan.",
          });
        }
      } catch (pdfError) {
        console.error("[Ingest] PDF Parsing Error:", pdfError.message);
        return res.status(422).json({
          success: false,
          message:
            "Failed to process the PDF file. It might be corrupted or password protected.",
        });
      }

      profileJson = await parseResumeWithAI(resumeText);

      user.resumeText = resumeText;
      user.resumeName = resumeName;
      user.resumeProfile = profileJson;
      await user.save();
    } else {
      // 4. Use Saved Resume
      if (!user.resumeText) {
        return res
          .status(400)
          .json({
            message: "No saved resume found. Please upload a PDF resume.",
          });
      }
      resumeText = user.resumeText;
      resumeName = user.resumeName;
      profileJson = user.resumeProfile;
    }

    // 5. Checking for existing "ongoing" session created in the last 10 seconds (Double-tap prevention)
    const existingSession = await Session.findOne({
      userId: req.user._id,
      status: "ongoing",
      createdAt: { $gt: new Date(Date.now() - 10000) }, // 10 seconds threshold
    });

    if (existingSession) {
      console.log(
        `[Ingest] Duplicate session request detected for user ${req.user._id}. Returning existing session.`,
      );
      return res.status(200).json({
        success: true,
        sessionId: existingSession._id,
        firstMessage: existingSession.transcript[0]?.content || "",
        profile: existingSession.profileJson,
        resumeName: existingSession.resumeName,
      });
    }

    // Mark any existing ongoing sessions for this user as abandoned
    await Session.updateMany(
      { userId: req.user._id, status: "ongoing" },
      { $set: { status: "abandoned" } }
    );

    // 6. Create New Session
    const session = await Session.create({
      userId: req.user._id,
      resumeText: resumeText,
      profileJson: profileJson,
      jobDescription: req.body.jobDescription || "",
      status: "ongoing",
    });

    // 7. Increment Monthly Usage Count (use req.fullUser from rate limiter middleware)
    const userToUpdate = req.fullUser;
    userToUpdate.interviewsUsed += 1;
    await userToUpdate.save();

    // 6. Generate Opening Greeting (Phase 1: Ice-breaking)
    const openPrompt = getOpeningGreetingPrompt(
      req.user.name,
      resumeText,
      req.body.jobDescription
    );
    const firstMessage = await getAIResponse([], openPrompt);

    session.transcript.push({
      role: "assistant",
      content:
        firstMessage ||
        "Hello! I'm your interviewer today. Are you ready to begin?",
      stage: "introduction",
    });
    await session.save();

    res.status(201).json({
      success: true,
      sessionId: session._id,
      firstMessage,
      profile: profileJson,
      resumeName: resumeName,
      interviewsUsed: userToUpdate.interviewsUsed,
      interviewLimit: userToUpdate.interviewLimit,
    });
  } catch (error) {
    console.error("Ingest Error Details:", error);
    res.status(500).json({
      success: false,
      message: "Error processing document.",
      error: process.env.NODE_ENV === "production" ? null : error.message,
    });
  }
};
