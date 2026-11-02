const multer = require('multer');
const { ApiError } = require('../utils/http');

function notFound(req, res) {
  res.status(404).json({ success: false, message: 'API route not found.' });
}

function errorHandler(error, _req, res, _next) {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? `The photograph is too large. Maximum size is ${Number(process.env.MAX_UPLOAD_MB) || 5} MB.`
      : 'The photograph could not be uploaded.';
    return res.status(413).json({ success: false, message });
  }
  if (error instanceof ApiError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.errors ? { errors: error.errors } : {})
    });
  }
  if (error?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'That record already exists.' });
  }
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(422).json({ success: false, message: 'A linked record could not be found.' });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'The request is too large.' });
  }
  console.error(error);
  return res.status(500).json({ success: false, message: 'Something went wrong on the server.' });
}

module.exports = { notFound, errorHandler };
