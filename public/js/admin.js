// ===================== FieLink admin.js =====================
const API = '/api/v1/admin';
let LISTINGS = [];
let CURRENT_VERIFY_ID = null;

document.addEventListener('DOMContentLoaded', async () => {
  const sessionRes = await fetch('/api/v1/admin/session');
  const session = await sessionRes.json();
  if (!session.isAdmin) {
    window.location.href = '/admin/login.html';
    return;
  }
  loadListings();
  loadLeads();
  loadReports();

  document.getElementById('f-photos').addEventListener('change', (e) => {
    document.getElementById('photo-count').textContent = `${e.target.files.length} photo(s) selected ${e.target.files.length < 8 ? '— minimum 8 required to publish' : '✓'}`;
  });
});

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { toast.className = 'toast'; }, 3500);
}

function switchTab(tab, el) {
  document.querySelectorAll('.admin-panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
  document.getElementById(`panel-${tab}`).classList.add('active');
  el.classList.add('active');
}

async function doLogout() {
  await fetch('/api/v1/admin/logout', { method: 'POST' });
  window.location.href = '/admin/login.html';
}

const VERIFICATION_LABELS = {
  physicalVisit: ['ti-home-check', 'Physical site visit completed'],
  originalPhotos: ['ti-camera', 'Original photos taken on-site'],
  idVerified: ['ti-id-badge', 'Landlord identity verified (Ghana Card / passport)'],
  ownershipDocs: ['ti-file-certificate', 'Ownership documents checked'],
  contactConfirmed: ['ti-brand-whatsapp', 'Contact number confirmed active on WhatsApp'],
  availabilityChecked: ['ti-refresh', 'Availability confirmed current']
};

// ---------- Listings ----------

async function loadListings() {
  const tbody = document.getElementById('listings-tbody');
  try {
    const res = await fetch(`${API}/listings`);
    const data = await res.json();
    LISTINGS = data.listings || [];
    if (LISTINGS.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-muted center" style="padding:30px">No listings yet. Add your first one above.</td></tr>`;
      return;
    }
    tbody.innerHTML = LISTINGS.map(listingRow).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted center" style="padding:30px">Could not load listings.</td></tr>`;
  }
}

function verifiedCount(v) {
  const keys = ['physicalVisit', 'originalPhotos', 'idVerified', 'ownershipDocs', 'contactConfirmed', 'availabilityChecked'];
  return keys.filter((k) => v && v[k]).length;
}

function listingRow(l) {
  const vCount = verifiedCount(l.verification);
  const pct = Math.round((vCount / 6) * 100);
  return `
    <tr>
      <td><strong>${escapeHTML(l.title)}</strong></td>
      <td>${escapeHTML(l.area)}</td>
      <td>GH₵${l.price.toLocaleString()}</td>
      <td>
        <div class="vprog">
          <div class="vprog-bar"><div class="vprog-fill" style="width:${pct}%"></div></div>
          <span>${vCount}/6</span>
          <button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px" onclick="openVerifyModal('${l.id}')">Edit</button>
        </div>
      </td>
      <td><span class="status-pill status-${l.status}">${l.status}</span></td>
      <td>${l.photos.length} photo${l.photos.length !== 1 ? 's' : ''}</td>
      <td style="white-space:nowrap">
        ${l.status === 'published'
          ? `<button class="btn btn-outline btn-sm" onclick="unpublishListing('${l.id}')">Unpublish</button>`
          : `<button class="btn btn-primary btn-sm" onclick="openVerifyModal('${l.id}')">Verify & publish</button>`}
        <button class="btn btn-sm" style="background:var(--dangerlt);color:var(--danger)" onclick="deleteListingConfirm('${l.id}')"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function createListing(e) {
  e.preventDefault();
  const photos = document.getElementById('f-photos').files;

  const formData = new FormData();
  formData.append('title', document.getElementById('f-title').value);
  formData.append('type', document.getElementById('f-type').value);
  formData.append('city', document.getElementById('f-city').value);
  formData.append('area', document.getElementById('f-area').value);
  formData.append('price', document.getElementById('f-price').value);
  formData.append('bedrooms', document.getElementById('f-bedrooms').value);
  formData.append('bathrooms', document.getElementById('f-bathrooms').value);
  formData.append('description', document.getElementById('f-description').value);
  formData.append('landlordName', document.getElementById('f-landlord-name').value);
  formData.append('landlordWhatsapp', document.getElementById('f-landlord-whatsapp').value);
  formData.append('diasporaReady', document.getElementById('f-diaspora').checked);
  for (const file of photos) formData.append('photos', file);

  try {
    const res = await fetch(`${API}/listings`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create listing.');
    showToast('Listing created as draft. Now complete verification before publishing.');
    document.getElementById('new-listing-form').reset();
    document.getElementById('photo-count').textContent = '0 photos selected';
    loadListings();
    document.querySelector('.admin-tab[data-tab="listings"]').click();
    setTimeout(() => openVerifyModal(data.listing.id), 300);
  } catch (err) {
    showToast(err.message, true);
  }
  return false;
}

async function deleteListingConfirm(id) {
  if (!confirm('Delete this listing permanently? This cannot be undone.')) return;
  try {
    const res = await fetch(`${API}/listings/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Could not delete listing.');
    showToast('Listing deleted.');
    loadListings();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function unpublishListing(id) {
  try {
    await fetch(`${API}/listings/${id}/unpublish`, { method: 'PATCH' });
    showToast('Listing unpublished.');
    loadListings();
  } catch (err) {
    showToast('Could not unpublish.', true);
  }
}

// ---------- Verification modal ----------

function openVerifyModal(id) {
  CURRENT_VERIFY_ID = id;
  const listing = LISTINGS.find((l) => l.id === id);
  if (!listing) return;
  renderChecklist(listing);
  document.getElementById('verify-modal').classList.add('open');
}

function closeVerifyModal() {
  document.getElementById('verify-modal').classList.remove('open');
  CURRENT_VERIFY_ID = null;
}

function renderChecklist(listing) {
  const body = document.getElementById('checklist-body');
  const v = listing.verification || {};
  body.innerHTML = Object.entries(VERIFICATION_LABELS).map(([key, [icon, label]]) => `
    <div class="checklist-item">
      <input type="checkbox" id="chk-${key}" ${v[key] ? 'checked' : ''} onchange="toggleVerificationStep('${key}', this.checked)"/>
      <i class="ti ${icon}" style="color:var(--em)"></i>
      <label for="chk-${key}" style="font-size:13px;flex:1">${label}</label>
    </div>
  `).join('');

  const statusEl = document.getElementById('verify-status');
  const count = verifiedCount(v);
  if (count === 6) {
    statusEl.innerHTML = `<span style="color:var(--em)"><i class="ti ti-check"></i> Fully verified — ready to publish</span>`;
  } else {
    statusEl.innerHTML = `<span style="color:var(--warn)">${count}/6 checks complete. Photos: ${listing.photos.length} (min. 8 required).</span>`;
  }
}

async function toggleVerificationStep(step, value) {
  if (!CURRENT_VERIFY_ID) return;
  try {
    const res = await fetch(`${API}/listings/${CURRENT_VERIFY_ID}/verification/${step}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const idx = LISTINGS.findIndex((l) => l.id === CURRENT_VERIFY_ID);
    LISTINGS[idx] = data.listing;
    renderChecklist(data.listing);
    loadListings();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function tryPublish(overrideUnverified = false) {
  if (!CURRENT_VERIFY_ID) return;
  try {
    const res = await fetch(`${API}/listings/${CURRENT_VERIFY_ID}/publish`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrideUnverified })
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.code === 'NOT_VERIFIED' || data.code === 'INSUFFICIENT_PHOTOS') {
        const confirmOverride = confirm(`${data.error}\n\nPublish anyway? This is not recommended — FieLink's trust promise depends on this standard being followed.`);
        if (confirmOverride) return tryPublish(true);
        return;
      }
      throw new Error(data.error);
    }
    showToast('Listing published! It is now live on the public site.');
    closeVerifyModal();
    loadListings();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ---------- Leads ----------

async function loadLeads() {
  const tbody = document.getElementById('leads-tbody');
  try {
    const res = await fetch(`${API}/leads`);
    const data = await res.json();
    const leads = data.leads || [];
    document.getElementById('leads-count').textContent = leads.length;
    if (leads.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted center" style="padding:30px">No broadcast signups yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = leads.map((l) => `
      <tr>
        <td>${escapeHTML(l.name)}</td>
        <td><a href="https://wa.me/${l.whatsapp.replace(/\D/g,'')}" target="_blank" style="color:var(--em)">${escapeHTML(l.whatsapp)}</a></td>
        <td><span class="status-pill status-published">${escapeHTML(l.type)}</span></td>
        <td>${new Date(l.createdAt).toLocaleDateString()}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted center" style="padding:30px">Could not load leads.</td></tr>`;
  }
}

// ---------- Reports ----------

async function loadReports() {
  const tbody = document.getElementById('reports-tbody');
  try {
    const res = await fetch(`${API}/reports`);
    const data = await res.json();
    const reports = data.reports || [];
    const openCount = reports.filter((r) => r.status === 'open').length;
    document.getElementById('reports-count').textContent = openCount;
    if (reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-muted center" style="padding:30px">No reports. That's a good sign.</td></tr>`;
      return;
    }
    tbody.innerHTML = reports.map((r) => `
      <tr>
        <td>${escapeHTML(r.reason)}</td>
        <td>${escapeHTML(r.listingId || '—')}</td>
        <td style="max-width:220px">${escapeHTML(r.details || '—')}</td>
        <td>${escapeHTML(r.reporterContact || '—')}</td>
        <td>
          <select onchange="updateReportStatus('${r.id}', this.value)" style="padding:4px 8px;border-radius:6px;border:1px solid var(--lgray);font-size:12px">
            <option value="open" ${r.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="investigating" ${r.status === 'investigating' ? 'selected' : ''}>Investigating</option>
            <option value="resolved" ${r.status === 'resolved' ? 'selected' : ''}>Resolved</option>
          </select>
        </td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted center" style="padding:30px">Could not load reports.</td></tr>`;
  }
}

async function updateReportStatus(id, status) {
  try {
    await fetch(`${API}/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    showToast('Report status updated.');
    loadReports();
  } catch (err) {
    showToast('Could not update status.', true);
  }
}
