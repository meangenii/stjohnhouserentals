# St. John House Rentals Rebuild

Phase one is a React rebuild of the current public site using Firebase Hosting for the frontend and Cloud Functions for backend endpoints. The current admin workspace now covers the Firebase-backed site shell, structured pages, rental properties, and charter listings.

## Current Status

- The shared site shell and major custom public routes now read structured seed content from `shared/siteContent.js`.
- All current public routes now render through the structured content layer instead of `SnapshotPage`.
- Rental properties now read directly from the live Firestore catalog in `firebase` mode when the frontend targets the deployed API, while site shell, structured pages, and charters continue through `siteApi`.
- Live site and property imagery can now be migrated out of the legacy host into Firebase Storage, with media records tracked in Firestore under `cmsMediaLibrary`.
- Active site shell, structured page, property, and charter images are now expected to use Firebase Storage URLs only; admin saves reject bundled or third-party image URLs.
- `npm run content:generate` writes the Functions-safe content artifacts under `functions/src/generated/` before build, emulators, or deploy.
- `siteApi` exposes structured page content plus rental and charter endpoints, including authenticated admin write endpoints for Firebase-backed site shell, page, property, and charter editing.
- `/admin` supports localhost-only Firebase auto sign-in through `VITE_ADMIN_AUTO_LOGIN_EMAIL` and `VITE_ADMIN_AUTO_LOGIN_PASSWORD` when you want live editing without the manual sign-in form on every session.

Start with these docs:

- [HOWTO.md](./HOWTO.md)
- [DESIGN.md](./DESIGN.md)
- [AGENTS.md](./AGENTS.md)

Useful commands:

```bash
npm install
npm run dev
npm run check
npm run firebase:doctor
npm run emulators
npm run deploy
npm run deploy:firestore
npm run deploy:storage
npm run media:migrate
npm run seed:firebase-data
npm run snapshot:site
```
