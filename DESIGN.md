# Design Doc

## Goal

Maintain the St. John House Rentals public site as a React application backed by Firebase Hosting and Cloud Functions, with a structured Firebase-backed admin for site shell, pages, properties, charters, media, clients, submissions, and recovery workflows.

## Reference Scope

The current live site centers on:

- Home
- About
- House Rentals
- Rental Accommodations
- Property For Sale
- Car Barge Information
- Passenger Ferry
- St John Car Rentals
- Charter Boats
- Local Attractions
- Advertise

Those live routes are captured into local snapshot files and drive the rebuild naming.

## Architecture

Frontend:

- `Vite + React`
- A local browser-history router in `src/lib/router.jsx` for route-level pages
- Styled with a single global CSS system for speed during rebuild
- Structured singleton page content stored in `shared/siteContent.js`
- Frontend asset resolution handled in `src/lib/contentAssets.js`
- Frontend page-content access handled in `src/lib/siteContentRepository.js`

Backend:

- Firebase Hosting serves the SPA
- Firebase Hosting rewrites `/api/**` to `siteApi`
- Firebase Hosting rewrites `/sitemap.xml`, `/robots.txt`, `/rental-properties/**`, `/1bedroom/**`, and `/charter-boat-rentals/**` to `siteSeo` so SEO output is built from published Firestore content at request time instead of from build-time property files
- Cloud Functions provides public endpoints plus authenticated, role-scoped admin actions

## Current Implementation Status

- The site shell plus the major custom public routes now render from structured shared seed content.
- Static public routes no longer depend on `SnapshotPage` or `src/content/siteSnapshot.js` at runtime.
- `/for-rent`, `/st-john-rentals`, and `/rental-properties/:slug` now all read through the same property repository boundary.
- `/charter-boat-rentals/:slug` now reads through the charter repository boundary, with sitemap-derived snapshot fallback data when the legacy charter directory collection is empty.
- `/admin` provides structured editing, media, submissions, clients, and owner-only backup/recovery workflows.

## Phase Boundary

Current boundary:

- Public marketing routes in React
- Shared site shell
- Structured content seed layer for singleton pages
- Snapshot pipeline, sanitized HTML archive, and catalog export for parity checks and seed refreshes
- Local rental property detail template backed by public-safe catalog data
- Firebase-backed admin editing for site shell, pages, properties, charters, media, clients, and submissions
- Owner-scoped backup, staging, cutover, and seed-reset actions
- Public contact endpoints with validation and rate limiting
- Function endpoints and deploy path
- Firebase client bootstrap

Do not add without an explicit product task:

- A freeform/unbounded page builder
- New live-data mutation scripts or one-off data operations
- New privileged admin actions without role boundaries

## Content Strategy

The rebuild is moving from scraped reference data toward structured seed documents:

- `shared/siteContent.js`: structured singleton page content used by the shared layout and migrated public routes
- `shared/migratedSnapshotContent.js`: rich-text seed content captured from the live site for routes that are still easiest to manage as controlled HTML sections
- `functions/src/siteContentRepository.js`: Cloud Functions bridge that reads generated in-tree artifacts and can later swap the seed layer to Firestore
- `src/lib/siteContentRepository.js`: frontend boundary that keeps page components independent from the delivery source
- `src/lib/propertyRepository.js` and `src/lib/charterRepository.js`: catalog boundaries that support local JSON and Firebase-backed `siteApi`
- `functions/src/generated/`: generated content artifacts copied into the deployable Functions source tree

Parity references are still preserved in:

- `reference/live-site/<date>/html/*.html`: sanitized HTML per tracked route
- `reference/live-site/<date>/snapshot.json`: extracted metadata
- `reference/live-site/<date>/property-catalog.json`: normalized rental property records
- `src/content/liveSiteSnapshot.json`: app-facing parity snapshot
- `public/livePropertyCatalog.json`: local rental catalog consumed through the repository layer
- `public/livePropertySummaryCatalog.json`: local rental summary catalog
- `public/liveCharterCatalog.json`: local charter catalog

This keeps route naming and seed data tied to the live site while the structured content layer stays editable in code.

## Route Plan

- `/`
- `/about-us`
- `/st-john-rentals`
- `/for-rent`
- `/property-for-sale`
- `/car-barge-information`
- `/passenger-ferry`
- `/cars`
- `/boats`
- `/map`
- `/advertise`
- `/privacy-policy`
- `/terms-of-agreement`
- `/rental-properties/:slug`
- `/charter-boat-rentals/:slug`
- `/admin`

## API Baseline

`siteApi` currently provides:

- `GET /api/health`
- `GET /api/site-config`
- `GET /api/content/site-shell`
- `GET /api/content/pages`
- `GET /api/content/pages/:key`
- `GET /api/properties`
- `GET /api/properties/catalog`
- `GET /api/properties/summary`
- `GET /api/properties/:slug`
- `GET /api/charters`
- `GET /api/charters/:slug`

These endpoints currently cover health/config checks, structured singleton page delivery, plus the public rental and charter contracts used during the rebuild.

## Next Technical Step

Keep hardening the Firebase-backed admin path:

1. Keep release checks green, including the authenticated editor emulator workflow.
2. Refresh the live snapshot before parity-sensitive content or route changes.
3. Split oversized admin/frontend modules when touching those areas.
4. Keep owner-only recovery operations separate from ordinary CMS admin edits.
