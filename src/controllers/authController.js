const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// JWT Generate
const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user._id);

  const cookieOptions = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };

  res
    .status(statusCode)
    .cookie("token", token, cookieOptions)
    .json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        interviewLimit: user.interviewLimit,
        interviewsUsed: user.interviewsUsed,
      },
      accessToken: token,
    });
};

exports.googleLogin = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: "No Google idToken provided" });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { email, name, picture, sub: googleId } = ticket.getPayload();

    let user = await User.findOne({ email });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        user.avatar = user.avatar || picture;
        await user.save();
      }
    } else {
      const baseUsername = email.split("@")[0].toLowerCase();
      let username = baseUsername;
      let counter = 1;
      while (await User.findOne({ username })) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      user = await User.create({
        email,
        name,
        username,
        avatar: picture,
        googleId,
      });
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error("Google Auth Error:", error.message);
    res.status(401).json({ message: "Invalid Google Identity Token" });
  }
};

exports.register = async (req, res) => {
  try {
    const { name, email, username, password } = req.body;
    const userIdentifier = username || email;

    if (!name || !userIdentifier || !password) {
      return res.status(400).json({
        message:
          "Please provide all the fields (name, username/email, password)",
      });
    }

    // Password strength validation
    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    const existingUser = await User.findOne({
      $or: [{ username: userIdentifier }, ...(email ? [{ email }] : [])],
    });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Username or Email already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userData = {
      name,
      username: userIdentifier,
      password: hashedPassword,
    };

    // Only add email if it's provided (avoid null in unique index)
    if (email) {
      userData.email = email;
    }

    const newUser = await User.create(userData);

    sendTokenResponse(newUser, 201, res);
  } catch (error) {
    console.error("Register Error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const identifier = username || email;

    if (!identifier || !password) {
      return res.status(400).json({ message: "Please provide all the fields" });
    }

    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid Password" });
    }
    // send token
    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.logout = (req, res) => {
  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000), // Quick expiry
    httpOnly: true,
  });

  res.status(200).json({ success: true, message: "Logged out successfully" });
};

exports.getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      username: req.user.username,
      email: req.user.email,
      avatar: req.user.avatar,
      interviewLimit: req.user.interviewLimit,
      interviewsUsed: req.user.interviewsUsed,
    },
  });
};

exports.checkUsername = async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const lowerUsername = username.toLowerCase().trim();

    const user = await User.findOne({ username: lowerUsername });

    if (!user) {
      return res.status(200).json({ available: true });
    }

    // If username exists, generate suggestions
    const suggestionsToTry = [
      `${lowerUsername}123`,
      `${lowerUsername}${new Date().getFullYear()}`,
      `${lowerUsername}_prep`,
      `${lowerUsername}01`,
      `${lowerUsername}_pro`,
    ];

    const existingUsers = await User.find({
      username: { $in: suggestionsToTry },
    }).select("username");
    const existingUsernames = existingUsers.map((u) => u.username);

    const validSuggestions = suggestionsToTry
      .filter((s) => !existingUsernames.includes(s))
      .slice(0, 3); // Return top 3 suggestions

    return res.status(200).json({
      available: false,
      suggestions: validSuggestions,
    });
  } catch (error) {
    console.error("Check Username Error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
