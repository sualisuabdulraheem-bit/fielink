const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();

// Generous limit for browsing, tight limit for form submissions —
// stops the lead/report forms being used to spam your inbox.
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many submissions. Please try again later.' }
});

// GET /api/v1/config — public, non-sensitive site config
router.get('/config', (req, res) => {
  res.json({ whatsappNumber: process.env.WHATSAPP_NUMBER || '233000000000' });
});

// GET /api/v1/listings?area=&minPrice=&maxPrice=&bedrooms=&verifiedOnly=&diasporaOnly=&city=
router.get('/listings', async (req, res, next) => {
  try {
    const { area, minPrice, maxPrice, bedrooms, verifiedOnly, diasporaOnly, city, q } = req.query;
    let listings = await db.getAllListings({ publicOnly: true });

    if (area) listings = listings.filter((l) => l.area.toLowerCase() === area.toLowerCase());
    if (city) listings = listings.filter((l) => l.city.toLowerCase() === city.toLowerCase());
    if (minPrice) listings = listings.filter((l) => l.price >= Number(minPrice));
    if (maxPrice) listings = listings.filter((l) => l.price <= Number(maxPrice));
    if (bedrooms) listings = listings.filter((l) => l.bedrooms >= Number(bedrooms));
    if (verifiedOnly === 'true') listings = listings.filter((l) => db.isFullyVerified(l.verification));
    if (diasporaOnly === 'true') listings = listings.filter((l) => l.diasporaReady);
    if (q) {
      const needle = q.toLowerCase();
      listings = listings.filter(
        (l) =>
          l.title.toLowerCase().includes(needle) ||
          l.area.toLowerCase().includes(needle) ||
          l.description.toLowerCase().includes(needle)
      );
    }

    res.json({ count: listings.length, listings });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/listings/:id
router.get('/listings/:id', async (req, res, next) => {
  try {
    const listing = await db.getListingById(req.params.id);
    if (!listing || listing.status !== 'published') {
      return res.status(404).json({ error: 'Listing not found.' });
    }
    res.json({ listing });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/areas — Neighbourhood Trust Index data
router.get('/areas', async (req, res, next) => {
  try {
    const stats = await db.getAreaStats();
    res.json({ areas: stats });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/testimonials
router.get('/testimonials', async (req, res, next) => {
  try {
    const testimonials = await db.getPublishedTestimonials();
    res.json({ testimonials });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/leads — WhatsApp broadcast signup
router.post('/leads', formLimiter, async (req, res, next) => {
  try {
    const { name, whatsapp, type, area } = req.body;
    if (!whatsapp || !/^\+?\d{9,15}$/.test(whatsapp.replace(/\s/g, ''))) {
      return res.status(400).json({ error: 'Please provide a valid WhatsApp number.' });
    }
    const lead = await db.createLead({ name, whatsapp, type, area });
    res.status(201).json({ ok: true, lead: { id: lead.id } });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/report — report a fraudulent or suspicious listing
router.post('/report', formLimiter, async (req, res, next) => {
  try {
    const { listingId, reporterContact, reason, details } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Please tell us what the issue is.' });
    }
    const report = await db.createReport({ listingId, reporterContact, reason, details });
    res.status(201).json({ ok: true, report: { id: report.id } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
