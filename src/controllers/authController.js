const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// JWT Generate 
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user._id);

  const cookieOptions = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production', 
    sameSite: 'lax', 
    path: '/',
  };

  res.status(statusCode).cookie('token', token, cookieOptions).json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
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
    return res.status(400).json({ message: 'No Google idToken provided' });
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
      user = await User.create({
        email,
        name,
        avatar: picture,
        googleId,
      });
    }

    sendTokenResponse(user, 200, res);
    
  } catch (error) {
    console.error('Google Auth Error:', error.message);
    res.status(401).json({ message: 'Invalid Google Identity Token' });
  }
};

exports.register = async (req , res) => {
  try {
    const {name, email , password} = req.body;

    if(!name || !email || !password) {
      return res.status(400).json({message : "Please provide all the fields (name, email, password)"});
    }

    const user = await User.findOne({email});

    if(user) {
      return res.status(400).json({message : "User already exists"});
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password , salt);

    const newUser = await User.create({ 
      name, 
      email, 
      password : hashedPassword
    });

    sendTokenResponse(newUser , 201 , res);
  } catch (error) {
    console.error('Register Error:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
}

exports.login = async (req , res) => {
  try {
    const {email , password} = req.body;

    if(!email || !password) {
      return res.status(400).json({message : "Please provide all the fields"});
    }

    const user = await User.findOne({email});

    if(!user) {
      return res.status(400).json({message : "User not found"});
    }

    const isMatch = await bcrypt.compare(password , user.password);


    if(!isMatch) {
      return res.status(400).json({message : "Invalid Password"});
    }
    // send token
    sendTokenResponse(user , 200 , res);
  } catch (error) {
    console.error('Login Error:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
}


exports.logout = (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000), // Quick expiry
    httpOnly: true,
  });

  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

exports.getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
      interviewLimit: req.user.interviewLimit,
      interviewsUsed: req.user.interviewsUsed,
    },
  });
};
