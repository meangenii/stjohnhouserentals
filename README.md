# St. John House Rentals Rebuild

Phase one is a React rebuild of the current public site using Firebase Hosting for the frontend and Cloud Functions for backend endpoints. The CMS editor comes later, on top of the same content structure.

## Current Status

- `Home` and `About` are custom React rebuilds.
- The remaining public routes are present in React and currently render snapshot-backed content from `src/content/liveSiteSnapshot.json`.
- `/for-rent` renders listing cards parsed from the live snapshot. A local `/rental-properties/:slug` route exists, but the listing cards still open the live site while local route parity continues.
- Snapshot refresh also updates `public/livePropertyCatalog.json` for the local property catalog flow.

Start with these docs:

- [HOWTO.md](./HOWTO.md)
- [DESIGN.md](./DESIGN.md)
- [AGENTS.md](./AGENTS.md)

Useful commands:

```bash
npm install
npm run snapshot:site
npm run dev
npm run check
npm run emulators
```
