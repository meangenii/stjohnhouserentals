# Design Doc

## Goal

Rebuild the current St. John House Rentals public site as a React application backed by Firebase Hosting and Cloud Functions. This phase is about public-site parity and cleaner architecture, not CMS editing yet.

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
- `react-router-dom` for route-level pages
- Styled with a single global CSS system for speed during rebuild
- Structured singleton page content stored in `shared/siteContent.js`
- Frontend asset resolution handled in `src/lib/contentAssets.js`
- Frontend page-content access handled in `src/lib/siteContentRepository.js`

Backend:

- Firebase Hosting serves the SPA
- Firebase Hosting rewrites `/api/**` to `siteApi`
- Cloud Functions provides public endpoints now and privileged actions later

## Current Implementation Status

- The site shell plus the major custom public routes now render from structured shared seed content.
- Static public routes no longer depend on `SnapshotPage` or `src/content/siteSnapshot.js` at runtime.
- `/for-rent`, `/st-john-rentals`, and `/rental-properties/:slug` now all read through the same property repository boundary.
- `/charter-boat-rentals/:slug` now reads through the charter repository boundary, with structured fallback data when the live charter catalog is empty.

## Phase Boundary

Build now:

- Public marketing routes in React
- Shared site shell
- Structured content seed layer for singleton pages
- Snapshot pipeline, raw HTML archive, and catalog export for parity checks and seed refreshes
- Local rental property detail template backed by public-safe catalog data
- Basic function endpoints and deploy path
- Firebase client bootstrap

Do not build yet:

- Admin login UI
- Firestore content models
- Custom editing tools
- Media library
- Publishing workflow

## Content Strategy

The rebuild is moving from scraped reference data toward structured seed documents:

- `shared/siteContent.js`: structured singleton page content used by the shared layout and migrated public routes
- `shared/migratedSnapshotContent.js`: rich-text seed content captured from the live site for routes that are still easiest to manage as controlled HTML sections
- `functions/src/siteContentRepository.js`: Cloud Functions bridge that reads generated in-tree artifacts and can later swap the seed layer to Firestore
- `src/lib/siteContentRepository.js`: frontend boundary that keeps page components independent from the delivery source
- `src/lib/propertyRepository.js` and `src/lib/charterRepository.js`: catalog boundaries that support local JSON now and `siteApi` later
- `functions/src/generated/`: generated content artifacts copied into the deployable Functions source tree

Parity references are still preserved in:

- `reference/live-site/<date>/html/*.html`: raw HTML per tracked route
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

After public-site parity is stable:

1. Swap the shared structured seed layer behind `siteApi` to Firestore-ready storage.
2. Move the generated public catalogs into the same storage boundary as the singleton page documents.
3. Add Firebase Auth and role boundaries.
4. Introduce an internal admin app for editing pages and rentals.
