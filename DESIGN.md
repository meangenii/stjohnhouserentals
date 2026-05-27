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
- Snapshot-fed content stored in `src/content/liveSiteSnapshot.json`

Backend:

- Firebase Hosting serves the SPA
- Firebase Hosting rewrites `/api/**` to `siteApi`
- Cloud Functions provides public endpoints now and privileged actions later

## Current Implementation Status

- `Home` and `About` are custom React page rebuilds.
- Most other public routes are already in React, but they currently render snapshot-backed page sections while route-by-route parity work continues.
- `/for-rent` displays listing cards parsed from the live site snapshot.
- A local `/rental-properties/:slug` template exists and is backed by the generated property catalog, but the listing cards still point to the live detail pages.

## Phase Boundary

Build now:

- Public marketing routes in React, with some still snapshot-backed during parity work
- Shared site shell
- Snapshot pipeline, raw HTML archive, and property catalog export
- Rental listing cards parsed from the live `/for-rent` page
- Local rental property detail template backed by public-safe catalog data
- Basic function endpoints and deploy path
- Firebase client bootstrap

Do not build yet:

- Admin login UI
- Firestore content models
- Custom editing tools
- Media library
- Publishing workflow

## Snapshot Strategy

The rebuild now starts from scraped reference data, not hand-written placeholder copy:

- `reference/live-site/<date>/html/*.html`: raw HTML per tracked route
- `reference/live-site/<date>/snapshot.json`: extracted metadata
- `reference/live-site/<date>/property-catalog.json`: normalized rental property records
- `src/content/liveSiteSnapshot.json`: app-consumable snapshot data
- `public/livePropertyCatalog.json`: public mock catalog consumed by the frontend

This keeps route naming, lead copy, and listing samples tied to the actual site while the React rebuild catches up.

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
- `GET /api/properties`
- `GET /api/properties/:slug`

These endpoints currently cover health/config checks plus the public property directory/detail contract used during the rebuild.

## Next Technical Step

After public-site parity is stable:

1. Move snapshot-backed content definitions from `src/content/liveSiteSnapshot.json` into Firestore-ready models.
2. Add Firebase Auth and role boundaries.
3. Introduce an internal admin app for editing pages and rentals.
