const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' }
});

// ---------- Auth ----------

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const validUsername = username === process.env.ADMIN_USERNAME;
  const validPassword =
    process.env.ADMIN_PASSWORD_HASH &&
    (await bcrypt.compare(password || '', process.env.ADMIN_PASSWORD_HASH));

  if (!validUsername || !validPassword) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  req.session.isAdmin = true;
  req.session.username = username;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// Everything below this line requires a logged-in admin.
router.use(requireAdmin);

// ---------- Listings (admin view — includes drafts) ----------

router.get('/listings', async (req, res, next) => {
  try {
    const listings = await db.getAllListings({ publicOnly: false });
    res.json({ listings });
  } catch (err) {
    next(err);
  }
});

router.post('/listings', upload.array('photos', 20), async (req, res, next) => {
  try {
    const photos = await db.uploadPhotos(req.files);
    const listing = await db.createListing({ ...req.body, photos });
    res.status(201).json({ listing });
  } catch (err) {
    next(err);
  }
});

router.post('/listings/:id/photos', upload.array('photos', 20), async (req, res, next) => {
  try {
    const listing = await db.getListingById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    const newPhotos = await db.uploadPhotos(req.files);
    const updated = await db.updateListing(req.params.id, { photos: [...listing.photos, ...newPhotos] });
    res.json({ listing: updated });
  } catch (err) {
    next(err);
  }
});

router.patch('/listings/:id', async (req, res, next) => {
  try {
    const updated = await db.updateListing(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ listing: updated });
  } catch (err) {
    next(err);
  }
});

// This is the enforcement point for the FieLink verification standard.
// A listing cannot be marked "verified" by flipping one field — each of
// the six checks must be individually confirmed, and publishing a listing
// that isn't fully verified requires an explicit override flag so nobody
// does it by accident.
router.patch('/listings/:id/verification/:step', async (req, res, next) => {
  try {
    const { id, step } = req.params;
    const { value } = req.body;
    const updated = await db.setVerificationStep(id, step, value, req.session.username);
    if (!updated) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ listing: updated });
  } catch (err) {
    next(err);
  }
});

router.patch('/listings/:id/publish', async (req, res, next) => {
  try {
    const listing = await db.getListingById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });

    const fullyVerified = db.isFullyVerified(listing.verification);
    if (!fullyVerified && !req.body.overrideUnverified) {
      return res.status(400).json({
        error:
          'This listing has not completed all 6 verification steps. Complete verification before publishing, or confirm the override if you understand the risk.',
        code: 'NOT_VERIFIED'
      });
    }

    if (listing.photos.length < 8 && !req.body.overrideUnverified) {
      return res.status(400).json({
        error: `FieLink standard requires at least 8 photos. This listing has ${listing.photos.length}.`,
        code: 'INSUFFICIENT_PHOTOS'
      });
    }

    const updated = await db.updateListing(req.params.id, { status: 'published' });
    res.json({ listing: updated });
  } catch (err) {
    next(err);
  }
});

router.patch('/listings/:id/unpublish', async (req, res, next) => {
  try {
    const updated = await db.updateListing(req.params.id, { status: 'draft' });
    if (!updated) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ listing: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/listings/:id', async (req, res, next) => {
  try {
    const ok = await db.deleteListing(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- Leads inbox ----------

router.get('/leads', async (req, res, next) => {
  try {
    const leads = await db.getAllLeads();
    res.json({ leads });
  } catch (err) {
    next(err);
  }
});

// ---------- Reports inbox ----------

router.get('/reports', async (req, res, next) => {
  try {
    const reports = await db.getAllReports();
    res.json({ reports });
  } catch (err) {
    next(err);
  }
});

router.patch('/reports/:id', async (req, res, next) => {
  try {
    const updated = await db.updateReportStatus(req.params.id, req.body.status);
    if (!updated) return res.status(404).json({ error: 'Report not found.' });
    res.json({ report: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
