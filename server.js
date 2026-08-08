require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Security & performance ----------
app.set('trust proxy', 1); // needed on Render.com so secure cookies + rate limiting see the real client IP

app.use(
  helmet({
    contentSecurityPolicy: false // relaxed for simplicity; tighten this once you add external scripts/fonts
  })
);
app.use(compression());

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev_only_change_me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8 // 8 hours
    }
  })
);

// ---------- Static files ----------
app.use(express.static(path.join(__dirname, 'public')));

// ---------- API ----------
app.use('/api/v1', apiRoutes);
app.use('/api/v1/admin', adminRoutes);

// ---------- Health check (useful for Render.com) ----------
app.get('/healthz', (req, res) => res.status(200).json({ ok: true, uptime: process.uptime() }));

// ---------- Fallbacks ----------
app.use('/admin', (req, res, next) => {
  // Serve the admin login/dashboard static files if not already matched above.
  next();
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ---------- Error handler ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message && err.message.includes('Only JPG, PNG')) {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'One of your photos is too large. Max 8MB per photo.' });
  }
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`FieLink server running on http://localhost:${PORT}`);
});
