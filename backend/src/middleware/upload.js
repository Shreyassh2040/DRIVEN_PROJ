const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { ApiError } = require('../utils/http');

const uploadRoot = path.resolve(__dirname, '..', '..', 'uploads');
const issueDir = path.join(uploadRoot, 'issues');
fs.mkdirSync(issueDir, { recursive: true });

const allowedTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
]);

const maxBytes = (Number(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, issueDir),
  filename: (_req, file, cb) => {
    const ext = allowedTypes.get(file.mimetype) || '.jpg';
    cb(null, `issue-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: maxBytes, files: 1, fields: 20 },
  fileFilter: (_req, file, cb) => {
    if (!allowedTypes.has(file.mimetype)) {
      return cb(new ApiError(415, 'Only JPEG, PNG or WebP photographs are allowed.'));
    }
    return cb(null, true);
  }
});

function signatureMatches(filePath, mimetype) {
  const buffer = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimetype === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function verifyImage(req, _res, next) {
  if (!req.file) return next();
  try {
    if (!signatureMatches(req.file.path, req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      throw new ApiError(415, 'The uploaded file is not a valid image.');
    }
    return next();
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    }
    return next(error);
  }
}

function removeUpload(filePath) {
  if (!filePath) return;
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(uploadRoot, filePath.replace(/^\/?uploads\//, ''));
  if (!resolved.startsWith(uploadRoot)) return;
  fs.promises.unlink(resolved).catch(() => {});
}

module.exports = { upload, verifyImage, removeUpload, uploadRoot };
