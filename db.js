/**
 * FieLink data layer.
 *
 * This is a JSON-file-backed store today. Every function is async and
 * returns plain objects/arrays on purpose — that means when you're ready
 * to migrate to Supabase (see README "Migrating to Supabase"), you only
 * need to rewrite the inside of these functions. Nothing in routes/ or
 * public/js/ needs to change, because they only ever talk to this module.
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const TESTIMONIALS_FILE = path.join(DATA_DIR, 'testimonials.json');

async function readJSON(file) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeJSON(file, data) {
  // Write to a temp file then rename — avoids corrupting the file if the
  // process crashes mid-write. Cheap insurance for a JSON-file datastore.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, file);
}

function newId(prefix = 'fl') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

const VERIFICATION_KEYS = [
  'physicalVisit',
  'originalPhotos',
  'idVerified',
  'ownershipDocs',
  'contactConfirmed',
  'availabilityChecked'
];

function isFullyVerified(verification) {
  if (!verification) return false;
  return VERIFICATION_KEYS.every((k) => verification[k] === true);
}

// ---------- Listings ----------

async function getAllListings({ publicOnly = false } = {}) {
  const listings = await readJSON(LISTINGS_FILE);
  if (!publicOnly) return listings;
  return listings.filter((l) => l.status === 'published');
}

async function getListingById(id) {
  const listings = await readJSON(LISTINGS_FILE);
  return listings.find((l) => l.id === id) || null;
}

async function createListing(data) {
  const listings = await readJSON(LISTINGS_FILE);
  const now = new Date().toISOString();
  const listing = {
    id: newId('listing'),
    title: data.title,
    type: data.type,
    area: data.area,
    city: data.city || 'Accra',
    price: Number(data.price),
    currency: data.currency || 'GHS',
    period: data.period || 'month',
    bedrooms: Number(data.bedrooms) || 0,
    bathrooms: Number(data.bathrooms) || 0,
    description: data.description || '',
    photos: data.photos || [],
    diasporaReady: !!data.diasporaReady,
    landlordName: data.landlordName || '',
    landlordWhatsapp: data.landlordWhatsapp || '',
    verification: {
      physicalVisit: false,
      originalPhotos: false,
      idVerified: false,
      ownershipDocs: false,
      contactConfirmed: false,
      availabilityChecked: false,
      verifiedDate: null,
      verifiedBy: null
    },
    status: 'draft', // draft -> published (never auto-verified)
    createdAt: now,
    updatedAt: now
  };
  listings.unshift(listing);
  await writeJSON(LISTINGS_FILE, listings);
  return listing;
}

async function updateListing(id, patch) {
  const listings = await readJSON(LISTINGS_FILE);
  const idx = listings.findIndex((l) => l.id === id);
  if (idx === -1) return null;

  const existing = listings[idx];
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };

  // Verification is a nested object — merge, don't replace, so partial
  // checklist updates from the admin UI don't wipe other checked boxes.
  if (patch.verification) {
    updated.verification = { ...existing.verification, ...patch.verification };
  }

  listings[idx] = updated;
  await writeJSON(LISTINGS_FILE, listings);
  return updated;
}

async function setVerificationStep(id, step, value, verifiedBy) {
  if (!VERIFICATION_KEYS.includes(step)) {
    throw new Error(`Unknown verification step: ${step}`);
  }
  const listing = await getListingById(id);
  if (!listing) return null;

  const verification = { ...listing.verification, [step]: !!value };

  if (isFullyVerified(verification)) {
    verification.verifiedDate = verification.verifiedDate || new Date().toISOString();
    verification.verifiedBy = verifiedBy || verification.verifiedBy || 'FieLink Team';
  } else {
    verification.verifiedDate = null;
    verification.verifiedBy = null;
  }

  return updateListing(id, { verification });
}

async function deleteListing(id) {
  const listings = await readJSON(LISTINGS_FILE);
  const filtered = listings.filter((l) => l.id !== id);
  await writeJSON(LISTINGS_FILE, filtered);
  return filtered.length !== listings.length;
}

async function getAreaStats() {
  const listings = await getAllListings({ publicOnly: true });
  const byArea = {};
  for (const l of listings) {
    if (!byArea[l.area]) byArea[l.area] = { area: l.area, city: l.city, count: 0, verifiedCount: 0, totalPrice: 0 };
    byArea[l.area].count += 1;
    byArea[l.area].totalPrice += l.price;
    if (isFullyVerified(l.verification)) byArea[l.area].verifiedCount += 1;
  }
  return Object.values(byArea)
    .map((a) => ({ ...a, avgPrice: Math.round(a.totalPrice / a.count) }))
    .sort((a, b) => b.count - a.count);
}

// ---------- Leads (WhatsApp broadcast signups) ----------

async function createLead(data) {
  const leads = await readJSON(LEADS_FILE);
  const lead = {
    id: newId('lead'),
    name: data.name || '',
    whatsapp: data.whatsapp,
    type: data.type || 'seeker', // seeker | landlord | agent | diaspora
    area: data.area || '',
    createdAt: new Date().toISOString()
  };
  leads.unshift(lead);
  await writeJSON(LEADS_FILE, leads);
  return lead;
}

async function getAllLeads() {
  return readJSON(LEADS_FILE);
}

// ---------- Fraud / listing reports ----------

async function createReport(data) {
  const reports = await readJSON(REPORTS_FILE);
  const report = {
    id: newId('report'),
    listingId: data.listingId || null,
    reporterContact: data.reporterContact || '',
    reason: data.reason,
    details: data.details || '',
    status: 'open',
    createdAt: new Date().toISOString()
  };
  reports.unshift(report);
  await writeJSON(REPORTS_FILE, reports);
  return report;
}

async function getAllReports() {
  return readJSON(REPORTS_FILE);
}

async function updateReportStatus(id, status) {
  const reports = await readJSON(REPORTS_FILE);
  const idx = reports.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  reports[idx].status = status;
  reports[idx].updatedAt = new Date().toISOString();
  await writeJSON(REPORTS_FILE, reports);
  return reports[idx];
}

// ---------- Testimonials ----------

async function getPublishedTestimonials() {
  const all = await readJSON(TESTIMONIALS_FILE);
  return all.filter((t) => t.published);
}

module.exports = {
  VERIFICATION_KEYS,
  isFullyVerified,
  getAllListings,
  getListingById,
  createListing,
  updateListing,
  setVerificationStep,
  deleteListing,
  getAreaStats,
  createLead,
  getAllLeads,
  createReport,
  getAllReports,
  updateReportStatus,
  getPublishedTestimonials
};
