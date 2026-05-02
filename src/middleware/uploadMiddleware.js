const multer = require('multer');
const path = require('path');

// Memory storage ensures files don't stay on the server disk
const storage = multer.memoryStorage();

// File Filter: Strictly allow only PDF files
const fileFilter = (req, file, cb) => {
  const isPdf = file.mimetype === 'application/pdf' || path.extname(file.originalname).toLowerCase() === '.pdf';

  if (isPdf) {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB Max
});

module.exports = upload;
