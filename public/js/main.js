// ===================== FieLink main.js =====================
const API = '/api/v1';
let WHATSAPP_NUMBER = '233000000000';
const USD_RATE = 15.5; // approximate GHS -> USD, update periodically

let ALL_LISTINGS = [];
let DIASPORA_MODE = false;
let ACTIVE_FILTERS = { verified: false, bedrooms: null };

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('year').textContent = new Date().getFullYear();

  try {
    const cfgRes = await fetch(`${API}/config`);
    const cfg = await cfgRes.json();
    WHATSAPP_NUMBER = cfg.whatsappNumber || WHATSAPP_NUMBER;
  } catch (err) { /* fall back to default */ }

  const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi FieLink, I have a question about a listing.')}`;
  const navWa = document.getElementById('nav-whatsapp');
  const footerWa = document.getElementById('footer-whatsapp');
  if (navWa) navWa.href = waLink;
  if (footerWa) footerWa.href = waLink;

  loadListings();
  loadAreaStats();
  loadTestimonials();
});

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { toast.className = 'toast'; }, 3200);
}

// ---------- Listings ----------

async function loadListings() {
  const grid = document.getElementById('listing-grid');
  if (!grid) return;
  grid.innerHTML = Array(6).fill('<div class="skeleton" style="height:280px"></div>').join('');

  try {
    const res = await fetch(`${API}/listings`);
    const data = await res.json();
    ALL_LISTINGS = data.listings || [];
    populateAreaDropdown();
    renderListings();
    const statEl = document.getElementById('stat-listings');
    if (statEl) statEl.textContent = ALL_LISTINGS.length;
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><i class="ti ti-wifi-off"></i>Could not load listings. Please refresh.</div>`;
  }
}

function populateAreaDropdown() {
  const select = document.getElementById('search-area');
  if (!select) return;
  const areas = [...new Set(ALL_LISTINGS.map((l) => l.area))].sort();
  select.innerHTML = '<option value="">All areas</option>' + areas.map((a) => `<option value="${a}">${a}</option>`).join('');
}

function isVerified(listing) {
  const v = listing.verification || {};
  return v.physicalVisit && v.originalPhotos && v.idVerified && v.ownershipDocs && v.contactConfirmed && v.availabilityChecked;
}

function formatPrice(listing) {
  if (DIASPORA_MODE) {
    const usd = Math.round(listing.price / USD_RATE);
    return `$${usd.toLocaleString()}/${listing.period}`;
  }
  return `GH₵${listing.price.toLocaleString()}/${listing.period}`;
}

function renderListings() {
  const grid = document.getElementById('listing-grid');
  if (!grid) return;

  const q = (document.getElementById('search-q')?.value || '').toLowerCase();
  const area = document.getElementById('search-area')?.value || '';
  const maxPrice = document.getElementById('search-max-price')?.value || '';
  const minBedrooms = document.getElementById('search-bedrooms')?.value || '';

  let filtered = ALL_LISTINGS.slice();

  if (q) filtered = filtered.filter((l) => l.title.toLowerCase().includes(q) || l.area.toLowerCase().includes(q));
  if (area) filtered = filtered.filter((l) => l.area === area);
  if (maxPrice) filtered = filtered.filter((l) => l.price <= Number(maxPrice));
  if (minBedrooms) filtered = filtered.filter((l) => l.bedrooms >= Number(minBedrooms));
  if (ACTIVE_FILTERS.verified) filtered = filtered.filter(isVerified);
  if (ACTIVE_FILTERS.bedrooms) filtered = filtered.filter((l) => l.bedrooms >= ACTIVE_FILTERS.bedrooms);

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-home-off"></i>No listings match your search yet. Try widening your filters, or join the WhatsApp broadcast to be notified when new verified listings match.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(cardHTML).join('');
}

function cardHTML(listing) {
  const verified = isVerified(listing);
  const photo = listing.photos && listing.photos[0];
  const waText = encodeURIComponent(`Hi, I'm interested in "${listing.title}" (${listing.area}) listed on FieLink.`);
  const waLink = listing.landlordWhatsapp
    ? `https://wa.me/${listing.landlordWhatsapp}?text=${waText}`
    : `https://wa.me/${WHATSAPP_NUMBER}?text=${waText}`;

  return `
  <div class="listing-card" onclick="openListing('${listing.id}')">
    <div class="listing-photo" ${photo ? `style="background-image:url('${photo}')"` : ''}>
      ${!photo ? '<div class="no-photo"><i class="ti ti-photo" style="font-size:28px"></i></div>' : ''}
      ${verified ? '<span class="verified-badge"><i class="ti ti-shield-check"></i> Verified</span>' : ''}
      ${listing.diasporaReady ? '<span class="diaspora-badge">Diaspora ready</span>' : ''}
      <span class="listing-price-tag">${formatPrice(listing)}</span>
    </div>
    <div class="listing-body">
      <div class="listing-title">${escapeHTML(listing.title)}</div>
      <div class="listing-meta">
        <span><i class="ti ti-map-pin"></i> ${escapeHTML(listing.area)}</span>
        <span><i class="ti ti-bed"></i> ${listing.bedrooms} bed</span>
        <span><i class="ti ti-bath"></i> ${listing.bathrooms} bath</span>
      </div>
      <div class="listing-actions">
        <a href="${waLink}" target="_blank" class="btn btn-whatsapp btn-sm" onclick="event.stopPropagation()"><i class="ti ti-brand-whatsapp"></i> Chat</a>
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openListing('${listing.id}')">Verification proof</button>
      </div>
    </div>
  </div>`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function applyFilters() { renderListings(); }

function setQuickFilter(type, el) {
  document.querySelectorAll('.filters-bar .filter-chip').forEach((c) => {
    if (['all', 'verified'].includes(c.dataset.filter)) c.classList.remove('active');
  });
  el.classList.add('active');
  ACTIVE_FILTERS.verified = type === 'verified';
  renderListings();
}

function setBedroomFilter(n, el) {
  const wasActive = el.classList.contains('active');
  document.querySelectorAll('.filters-bar .filter-chip').forEach((c) => {
    if (!['all', 'verified'].includes(c.dataset.filter)) c.classList.remove('active');
  });
  if (wasActive) {
    ACTIVE_FILTERS.bedrooms = null;
  } else {
    el.classList.add('active');
    ACTIVE_FILTERS.bedrooms = n;
  }
  renderListings();
}

function toggleDiasporaMode() {
  DIASPORA_MODE = document.getElementById('diaspora-toggle').checked;
  renderListings();
  showToast(DIASPORA_MODE ? 'Diaspora mode on — prices shown in USD' : 'Diaspora mode off — prices shown in GH₵');
}

// ---------- Listing detail modal ----------

function openListing(id) {
  const listing = ALL_LISTINGS.find((l) => l.id === id);
  if (!listing) return;
  const verified = isVerified(listing);
  const v = listing.verification || {};

  const steps = [
    ['physicalVisit', 'ti-home-check', 'Physical site visit'],
    ['originalPhotos', 'ti-camera', 'Original photos taken on-site'],
    ['idVerified', 'ti-id-badge', 'Landlord identity verified'],
    ['ownershipDocs', 'ti-file-certificate', 'Ownership documents checked'],
    ['contactConfirmed', 'ti-brand-whatsapp', 'Contact number confirmed'],
    ['availabilityChecked', 'ti-refresh', 'Availability confirmed']
  ];

  const waText = encodeURIComponent(`Hi, I'm interested in "${listing.title}" (${listing.area}) listed on FieLink.`);
  const waLink = listing.landlordWhatsapp
    ? `https://wa.me/${listing.landlordWhatsapp}?text=${waText}`
    : `https://wa.me/${WHATSAPP_NUMBER}?text=${waText}`;

  const photosHTML = (listing.photos && listing.photos.length)
    ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:16px">${listing.photos.slice(0, 9).map((p) => `<img src="${p}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px" loading="lazy"/>`).join('')}</div>`
    : `<div class="no-photo" style="height:160px;border-radius:8px;margin-bottom:16px"><i class="ti ti-photo" style="font-size:28px"></i></div>`;

  document.getElementById('listing-modal-content').innerHTML = `
    ${photosHTML}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
      <h3 style="font-size:20px">${escapeHTML(listing.title)}</h3>
      ${verified ? '<span class="badge-pill badge-verified"><i class="ti ti-shield-check"></i> Verified</span>' : '<span class="badge-pill" style="background:var(--warnlt);color:var(--warn)">Verification pending</span>'}
    </div>
    <div class="listing-meta mb-16"><span><i class="ti ti-map-pin"></i> ${escapeHTML(listing.area)}, ${escapeHTML(listing.city)}</span><span><i class="ti ti-bed"></i> ${listing.bedrooms} bed</span><span><i class="ti ti-bath"></i> ${listing.bathrooms} bath</span></div>
    <div class="serif" style="font-size:24px;color:var(--em);margin-bottom:16px">${formatPrice(listing)}</div>
    <p style="font-size:14px;color:var(--text2);margin-bottom:20px;line-height:1.6">${escapeHTML(listing.description || 'No description provided.')}</p>

    <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--mgray);margin-bottom:10px">Verification proof</div>
    <div style="margin-bottom:20px">
      ${steps.map(([key, icon, label]) => `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0">
          <i class="ti ${icon}" style="font-size:16px;color:${v[key] ? 'var(--em)' : 'var(--lgray)'}"></i>
          <span style="font-size:13px;color:${v[key] ? 'var(--navy)' : 'var(--mgray)'}">${label}</span>
          ${v[key] ? '<i class="ti ti-check" style="margin-left:auto;color:var(--em);font-size:14px"></i>' : '<i class="ti ti-x" style="margin-left:auto;color:var(--lgray);font-size:14px"></i>'}
        </div>
      `).join('')}
    </div>
    ${v.verifiedDate ? `<div style="font-size:12px;color:var(--mgray);margin-bottom:16px">Verified on ${new Date(v.verifiedDate).toLocaleDateString()} by ${escapeHTML(v.verifiedBy || 'FieLink')}</div>` : ''}

    <div style="display:flex;gap:8px">
      <a href="${waLink}" target="_blank" class="btn btn-whatsapp btn-block"><i class="ti ti-brand-whatsapp"></i> Chat on WhatsApp</a>
    </div>
    <button class="btn btn-outline btn-block" style="margin-top:8px" onclick="openReportModal('${listing.id}')"><i class="ti ti-flag"></i> Report this listing</button>
  `;
  document.getElementById('listing-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('listing-modal').classList.remove('open');
}

function openReportModal(listingId) {
  closeModal();
  window.location.href = `/report.html?listing=${listingId}`;
}

// ---------- Trust Index ----------

async function loadAreaStats() {
  const body = document.getElementById('trust-index-body');
  if (!body) return;
  try {
    const res = await fetch(`${API}/areas`);
    const data = await res.json();
    const areas = data.areas || [];
    if (areas.length === 0) {
      body.innerHTML = `<div class="empty-state"><i class="ti ti-map-pin-off"></i>No verified data yet — check back once listings are published.</div>`;
      return;
    }
    const maxCount = Math.max(...areas.map((a) => a.count));
    body.innerHTML = areas.map((a) => `
      <div class="trust-row">
        <span>${escapeHTML(a.area)}</span>
        <span>${a.count} listing${a.count !== 1 ? 's' : ''}</span>
        <span class="tr-avg">GH₵${a.avgPrice.toLocaleString()}/mo avg</span>
        <span>
          <div class="trust-bar-bg"><div class="trust-bar-fill" style="width:${Math.round((a.verifiedCount / a.count) * 100)}%"></div></div>
        </span>
      </div>
    `).join('');
  } catch (err) {
    body.innerHTML = `<div class="empty-state">Could not load trust index.</div>`;
  }
}

// ---------- Testimonials ----------

async function loadTestimonials() {
  try {
    const res = await fetch(`${API}/testimonials`);
    const data = await res.json();
    const testimonials = data.testimonials || [];
    if (testimonials.length === 0) return;
    document.getElementById('testimonials-section').style.display = 'block';
    document.getElementById('testi-grid').innerHTML = testimonials.map((t) => `
      <div class="testi-card">
        <div class="testi-quote">"${escapeHTML(t.quote)}"</div>
        <div class="testi-name">${escapeHTML(t.name)}</div>
        <div class="testi-area">${escapeHTML(t.area || '')}</div>
      </div>
    `).join('');
  } catch (err) { /* silent — testimonials are non-critical */ }
}

// ---------- Calculator ----------

function runCalculator() {
  const income = Number(document.getElementById('calc-income').value) || 0;
  const years = Number(document.getElementById('calc-years').value) || 1;
  const monthlyEl = document.getElementById('calc-monthly');
  const noteEl = document.getElementById('calc-note');
  const matchEl = document.getElementById('calc-match');

  if (income <= 0) {
    monthlyEl.textContent = 'GH₵0';
    noteEl.textContent = 'Enter your income to calculate';
    matchEl.textContent = '—';
    return;
  }

  const recommendedMonthly = Math.round(income * 0.3);
  const totalUpfront = recommendedMonthly * 12 * years;

  monthlyEl.textContent = `GH₵${recommendedMonthly.toLocaleString()}`;
  noteEl.textContent = `Based on the 30% rule. You'd need roughly GH₵${totalUpfront.toLocaleString()} upfront for ${years} year${years > 1 ? 's' : ''} of rent.`;

  const matches = ALL_LISTINGS.filter((l) => l.price <= recommendedMonthly);
  matchEl.textContent = matches.length > 0
    ? `${matches.length} verified listing${matches.length !== 1 ? 's' : ''} on FieLink currently fit this budget.`
    : `No listings currently match this budget — join the WhatsApp broadcast to be notified when one does.`;
}

// ---------- Lead form ----------

async function submitLead(e) {
  e.preventDefault();
  const name = document.getElementById('lead-name').value;
  const whatsapp = document.getElementById('lead-whatsapp').value;
  const type = document.getElementById('lead-type').value;

  try {
    const res = await fetch(`${API}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, whatsapp, type })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    showToast("You're on the list! We'll message you on WhatsApp with new verified listings.");
    document.getElementById('lead-form').reset();
  } catch (err) {
    showToast(err.message, true);
  }
  return false;
}
