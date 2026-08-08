const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`);
  }
});

function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, or WEBP images are allowed.'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024, // 8MB per photo
    files: 20
  }
});

module.exports = { upload, UPLOAD_DIR };
