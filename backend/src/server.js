require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const db = require('./config/db');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errors');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Set a JWT_SECRET of at least 32 characters in backend/.env before starting the API.');
  process.exit(1);
}

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const frontendDir = path.resolve(__dirname, '..', '..', 'frontend');
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5500,http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
if (isProduction) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://maps.googleapis.com', 'https://maps.gstatic.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: [
        "'self'", 'data:', 'blob:',
        'https://maps.googleapis.com', 'https://maps.gstatic.com',
        'https://*.googleapis.com', 'https://*.ggpht.com', 'https://*.google.com'
      ],
      connectSrc: ["'self'", 'https://maps.googleapis.com', 'https://*.googleapis.com'],
      frameSrc: ["'self'", 'https://www.google.com', 'https://maps.google.com'],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  hsts: isProduction ? undefined : false
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down and try again.' }
}));

app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({
      success: true,
      data: {
        status: 'ok',
        database: 'connected',
        project: 'Smart City Assistance and Discovery Platform',
        time: new Date().toISOString()
      }
    });
  } catch {
    return res.status(503).json({ success: false, data: { status: 'error', database: 'disconnected' }, message: 'Database unavailable.' });
  }
});

app.use('/api', routes);
app.use('/api', notFound);

// The same Express process can serve the vanilla frontend. Running the
// frontend on a separate static server is also supported via CLIENT_ORIGIN.
app.use(express.static(frontendDir, {
  extensions: ['html'],
  maxAge: isProduction ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

app.use((req, res) => {
  if (req.accepts('html')) return res.status(404).sendFile(path.join(frontendDir, '404.html'));
  return res.status(404).json({ success: false, message: 'Not found.' });
});

app.use(errorHandler);

let server;
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  let shuttingDown = false;

  const shutdown = reason => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${reason}. Closing server…`);
    server.close(() => db.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 8000).unref();
  };

  server = app.listen(port, () => {
    console.log(`Smart City API and portal running at http://localhost:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use.`);
      console.error('Stop the other process, or start on another port: PORT=3001 npm start');
      process.exit(1);
    }
    throw error;
  });

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  // Safety net: if the launching terminal/npm exits, stop instead of orphaning the port.
  // Set DETACH_OK=1 when you intentionally want the server to survive its parent.
  if (process.env.DETACH_OK !== '1') {
    const parentPid = process.ppid;
    const parentWatch = setInterval(() => {
      if (process.ppid === parentPid) return;
      clearInterval(parentWatch);
      shutdown('Parent process exited');
    }, 2000);
    parentWatch.unref();
  }
}

module.exports = app;
