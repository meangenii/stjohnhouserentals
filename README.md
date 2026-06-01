# St. John House Rentals Rebuild

Phase one is a React rebuild of the current public site using Firebase Hosting for the frontend and Cloud Functions for backend endpoints. The CMS editor comes later, on top of the same content structure.

## Current Status

- The shared site shell and major custom public routes now read structured seed content from `shared/siteContent.js`.
- All current public routes now render through the structured content layer instead of `SnapshotPage`.
- Rental properties now read directly from the live Firestore catalog in `firebase` mode when the frontend targets the deployed API, while charters continue through `siteApi`.
- `npm run content:generate` writes the Functions-safe content artifacts under `functions/src/generated/` before build, emulators, or deploy.
- `siteApi` exposes structured page content plus rental and charter endpoints, including authenticated admin write endpoints for Firebase-backed property and charter editing.

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
npm run seed:firebase-data
npm run snapshot:site
```
