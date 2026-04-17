const multer = require('multer');
const path = require('path');

// Memory storage ensures files don't stay on the server disk
const storage = multer.memoryStorage();

// File Filter: Sirf PDF allow karenge abhi ke liye
const fileFilter = (req, file, cb) => {
  const allowedTypes = /pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Error: Sirf PDF files hi allowed hain!'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB Max
});

module.exports = upload;
