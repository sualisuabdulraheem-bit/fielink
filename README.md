# FieLink

**Trusted Homes. Real Connections.**

Ghana's verified-first property platform. Every listing must pass a 6-step verification checklist — enforced by the server, not just the UI — before it can go live.

---

## What makes this different from a template

1. **Verification is enforced in code, not just marketing copy.** The admin dashboard has a 6-point checklist (physical visit, original photos, ID check, ownership docs, contact confirmed, availability confirmed). The server refuses to publish a listing until all six are true, or requires an explicit override confirmation if you choose to bypass it. Competitors say "verified." FieLink's software makes it structurally hard to lie about that.
2. **A minimum photo count is enforced server-side.** Fewer than 8 photos blocks publishing by default.
3. **WhatsApp is a first-class citizen**, not an afterthought — click-to-chat on every listing, a broadcast signup form, and a diaspora mode toggle that switches prices to USD.
4. **A Neighbourhood Trust Index** — live, aggregated stats per area (listing count, average price, % verified) — computed from real data. No competitor publishes this.
5. **A built-in fraud reporting flow** (`/report.html`) that feeds directly into the admin dashboard's Reports inbox — most competitors have no visible reporting mechanism at all.
6. **A rent affordability calculator** using the 30%-of-income guideline, matched live against current listings.
7. **Rate-limited public forms** (leads, reports) so the site can't be spammed.

---

## Tech stack

- **Backend:** Node.js + Express
- **Storage:** JSON files today (`/data`), designed to migrate cleanly to Supabase — see "Migrating to Supabase" below. All data access goes through `db.js`; nothing else touches the files directly.
- **Uploads:** Multer, saved to `/public/uploads`
- **Auth:** express-session + bcrypt (no third-party auth dependency, no cost)
- **Frontend:** Plain HTML/CSS/JS — no build step, no framework tax. Fast to load on the mobile data most Ghanaian users are on.

---

## Local setup

```bash
npm install
cp .env.example .env
npm run hash-password   # follow the prompt, paste the output hash into .env
```

Edit `.env`:
- `ADMIN_USERNAME` — pick a username
- `ADMIN_PASSWORD_HASH` — from the command above
- `SESSION_SECRET` — any long random string
- `WHATSAPP_NUMBER` — your FieLink WhatsApp Business number, digits only, country code first (e.g. `233241234567`)

Run it:
```bash
npm run dev      # auto-restarts on file changes
# or
npm start
```

Visit `http://localhost:3000`. Admin dashboard is at `http://localhost:3000/admin/login.html`.

---

## Deploying to Render.com (matches your existing plan)

1. Push this folder to a new GitHub repository.
2. On Render.com: **New → Web Service** → connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables in Render's dashboard (Environment tab) — same keys as `.env.example`. Never commit `.env` itself.
6. **Important:** Render's free tier has an ephemeral filesystem — uploaded photos and the JSON data files will be wiped on redeploy or restart. This is fine for your first 2–4 weeks of testing, but before you onboard real landlords, either:
   - Upgrade to a Render persistent disk (Settings → Disks), or
   - Migrate to Supabase (recommended — see below, and it's already on your roadmap).

---

## Migrating to Supabase

Your business plan already calls for this once listings volume grows. When you're ready:

1. Create a Supabase project, add a `listings`, `leads`, `reports`, and `testimonials` table matching the shapes in `db.js`.
2. Rewrite the functions inside `db.js` to call the Supabase client instead of reading/writing JSON files. The function signatures (`getAllListings`, `createListing`, `setVerificationStep`, etc.) stay the same.
3. Nothing in `routes/`, `public/js/main.js`, or `public/js/admin.js` needs to change — they only ever call `db.js`.
4. For photo storage, switch from local disk (Multer's `diskStorage`) to Supabase Storage — upload the file buffer instead of writing to `/public/uploads`, and store the returned public URL in `photos[]`.

This is why the data layer was built this way from day one — the migration is a rewrite of one file, not a rewrite of the app.

---

## Adding your first real listings

1. Log into `/admin/login.html`.
2. Go to **+ New listing**, fill in the details, upload at least 8 real on-site photos.
3. It saves as a **draft** — it is not visible on the public site yet.
4. Click **Verify & publish** on the listing row. Check off each of the 6 verification steps as you genuinely complete them in the field — don't check a box you haven't actually done. This checklist is your trust brand; treat it as such.
5. Once all 6 are checked and 8+ photos are present, click **Publish listing**. It goes live immediately.
6. Delete the sample listing (`sample-1`) from `data/listings.json` once you have real listings — it's there only so you can see how the UI renders with data.

---

## API reference (all under `/api/v1`)

**Public:**
- `GET /listings?area=&minPrice=&maxPrice=&bedrooms=&verifiedOnly=&diasporaOnly=&city=&q=`
- `GET /listings/:id`
- `GET /areas` — Neighbourhood Trust Index data
- `GET /testimonials`
- `GET /config` — public site config (WhatsApp number)
- `POST /leads` — broadcast signup
- `POST /report` — fraud/listing report

**Admin (session-authenticated, prefix `/api/v1/admin`):**
- `POST /login`, `POST /logout`, `GET /session`
- `GET /listings` (includes drafts)
- `POST /listings` (multipart form, field `photos` for files)
- `POST /listings/:id/photos` (add more photos to existing listing)
- `PATCH /listings/:id` (general field updates)
- `PATCH /listings/:id/verification/:step` — body `{ "value": true|false }`
- `PATCH /listings/:id/publish` — body `{ "overrideUnverified": true }` to force-publish
- `PATCH /listings/:id/unpublish`
- `DELETE /listings/:id`
- `GET /leads`
- `GET /reports`, `PATCH /reports/:id` — body `{ "status": "open"|"investigating"|"resolved" }`

---

## Security notes

- Passwords are hashed with bcrypt — never stored in plain text.
- Sessions are httpOnly cookies; `secure: true` is automatically enabled in production.
- Rate limiting is applied to login (8 attempts / 15 min) and public forms (10 / 15 min) to prevent abuse.
- Helmet is enabled for standard HTTP security headers.
- File uploads are restricted to JPG/PNG/WEBP, max 8MB each, max 20 files per request.
- `.env` is git-ignored — never commit real secrets.

Before you have real user data flowing through this, have a Ghanaian solicitor review `public/policy.html`, and make sure your Data Protection Commission registration number is filled in there (currently a placeholder).

---

## What's still a placeholder — fill these in before launch

- `data/listings.json` — delete `sample-1` once you have real listings
- `public/policy.html` — DPC registration number, business registration number, WhatsApp number, effective date
- `.env` — `WHATSAPP_NUMBER`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`
- Logo — currently text-based ("FieLink" wordmark in CSS). Drop your actual logo file into `public/img/` and swap the `.nav-logo` elements in the HTML files for an `<img>` tag once you have it exported in the right format.

---

FieLink — Accra, Ghana. Trusted Homes. Real Connections.
