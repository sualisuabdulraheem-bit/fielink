/**
 * FieLink data layer — Supabase edition.
 *
 * This replaces the original JSON-file-backed store. Every exported
 * function keeps the exact same name and return shape as before, so
 * nothing in routes/, public/js/, or anywhere else needed to change.
 * Data now lives in Supabase Postgres (persists across restarts) and
 * photos live in Supabase Storage (also persists — unlike Render's
 * free-tier disk, which wipes on every restart).
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PHOTOS_BUCKET = 'listing-photos';

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

// Convert a Supabase row (snake_case columns) into the camelCase shape
// the rest of the app already expects.
function rowToListing(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    area: row.area,
    city: row.city,
    price: Number(row.price),
    currency: row.currency,
    period: row.period,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    description: row.description || '',
    photos: row.photos || [],
    diasporaReady: !!row.diaspora_ready,
    landlordName: row.landlord_name || '',
    landlordWhatsapp: row.landlord_whatsapp || '',
    verification: row.verification || {},
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToLead(row) {
  return {
    id: row.id,
    name: row.name || '',
    whatsapp: row.whatsapp,
    type: row.type,
    area: row.area || '',
    createdAt: row.created_at
  };
}

function rowToReport(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    reporterContact: row.reporter_contact || '',
    reason: row.reason,
    details: row.details || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ---------- Listings ----------

async function getAllListings({ publicOnly = false } = {}) {
  let query = supabase.from('listings').select('*').order('created_at', { ascending: false });
  if (publicOnly) query = query.eq('status', 'published');
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToListing);
}

async function getListingById(id) {
  const { data, error } = await supabase.from('listings').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return rowToListing(data);
}

async function createListing(data) {
  const now = new Date().toISOString();
  const row = {
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
    diaspora_ready: !!data.diasporaReady,
    landlord_name: data.landlordName || '',
    landlord_whatsapp: data.landlordWhatsapp || '',
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
    status: 'draft',
    created_at: now,
    updated_at: now
  };
  const { data: inserted, error } = await supabase.from('listings').insert(row).select().single();
  if (error) throw error;
  return rowToListing(inserted);
}

async function updateListing(id, patch) {
  const existing = await getListingById(id);
  if (!existing) return null;

  const dbPatch = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.type !== undefined) dbPatch.type = patch.type;
  if (patch.area !== undefined) dbPatch.area = patch.area;
  if (patch.city !== undefined) dbPatch.city = patch.city;
  if (patch.price !== undefined) dbPatch.price = Number(patch.price);
  if (patch.currency !== undefined) dbPatch.currency = patch.currency;
  if (patch.period !== undefined) dbPatch.period = patch.period;
  if (patch.bedrooms !== undefined) dbPatch.bedrooms = Number(patch.bedrooms);
  if (patch.bathrooms !== undefined) dbPatch.bathrooms = Number(patch.bathrooms);
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.photos !== undefined) dbPatch.photos = patch.photos;
  if (patch.diasporaReady !== undefined) dbPatch.diaspora_ready = !!patch.diasporaReady;
  if (patch.landlordName !== undefined) dbPatch.landlord_name = patch.landlordName;
  if (patch.landlordWhatsapp !== undefined) dbPatch.landlord_whatsapp = patch.landlordWhatsapp;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.verification) {
    dbPatch.verification = { ...existing.verification, ...patch.verification };
  }

  const { data, error } = await supabase.from('listings').update(dbPatch).eq('id', id).select().single();
  if (error) throw error;
  return rowToListing(data);
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
  const { error, count } = await supabase.from('listings').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  return (count || 0) > 0;
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

// ---------- Photo storage (Supabase Storage) ----------

async function uploadPhotos(files) {
  // Uploaded in parallel rather than one-at-a-time — with 8 photos, doing
  // this sequentially means the client's connection has to stay alive for
  // 8 consecutive round trips before it gets a response, which is a long
  // window for a mobile connection to drop mid-request. Parallel uploads
  // cut that window down to roughly the time of a single upload.
  const uploadOne = async (file) => {
    if (!file.buffer || file.buffer.length === 0) {
      throw new Error(`Photo "${file.originalname}" arrived empty — please try uploading it again.`);
    }
    const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const path = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });
    if (error) throw error;
    const { data: pub } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  };

  return Promise.all((files || []).map(uploadOne));
}

// ---------- Leads (WhatsApp broadcast signups) ----------

async function createLead(data) {
  const row = {
    id: newId('lead'),
    name: data.name || '',
    whatsapp: data.whatsapp,
    type: data.type || 'seeker',
    area: data.area || '',
    created_at: new Date().toISOString()
  };
  const { data: inserted, error } = await supabase.from('leads').insert(row).select().single();
  if (error) throw error;
  return rowToLead(inserted);
}

async function getAllLeads() {
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToLead);
}

// ---------- Fraud / listing reports ----------

async function createReport(data) {
  const row = {
    id: newId('report'),
    listing_id: data.listingId || null,
    reporter_contact: data.reporterContact || '',
    reason: data.reason,
    details: data.details || '',
    status: 'open',
    created_at: new Date().toISOString()
  };
  const { data: inserted, error } = await supabase.from('reports').insert(row).select().single();
  if (error) throw error;
  return rowToReport(inserted);
}

async function getAllReports() {
  const { data, error } = await supabase.from('reports').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToReport);
}

async function updateReportStatus(id, status) {
  const { data, error } = await supabase
    .from('reports')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? rowToReport(data) : null;
}

// ---------- Testimonials ----------

async function getPublishedTestimonials() {
  const { data, error } = await supabase.from('testimonials').select('*').eq('published', true);
  if (error) throw error;
  return (data || []).map((t) => ({ id: t.id, quote: t.quote, name: t.name, area: t.area || '' }));
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
  uploadPhotos,
  createLead,
  getAllLeads,
  createReport,
  getAllReports,
  updateReportStatus,
  getPublishedTestimonials
};
