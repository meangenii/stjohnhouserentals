# AGENTS

## Current Phase

This repo is past the initial public-site rebuild and is now in Firebase-backed CMS hardening:

- Preserve the public St. John House Rentals React site and route parity
- Use Firebase Hosting for the frontend
- Use Cloud Functions for public API, admin CMS actions, and recovery operations
- Keep the existing structured admin editor maintainable; do not introduce a freeform page-builder model

## Product Intent

The product is a focused CMS for content-driven rental sites. The current goal is to keep the public site production-clean while hardening the Firebase-backed admin, structured content, media, property, charter, client, and recovery workflows.

## Source Of Truth

- Current visual and content reference: `https://www.stjohnhouserentals.com/`
- Run `npm run snapshot:site` before making parity-sensitive route or content changes
- App-facing snapshot data lives in `src/content/liveSiteSnapshot.json`
- Sanitized HTML parity references live in `reference/live-site/<date>/html/`
- Public route structure should stay close to the current site unless there is a clear reason to improve it

## Repo Map

- `src/`: React frontend
- `src/content/`: temporary content layer to be replaced by CMS data later
- `src/components/`: layout and reusable UI
- `src/pages/`: route-level screens
- `src/lib/`: Firebase and API helpers
- `functions/`: Cloud Functions code

## Working Rules

1. Preserve route parity before adding new product ideas.
2. Prefer snapshot-driven content over hand-written placeholder copy.
3. Keep functions small and public-safe; privileged operations must be authenticated and role-scoped.
4. Avoid a freeform page builder in code. The CMS should use structured sections and controlled block types.
5. Maintain responsive behavior on desktop and mobile with no dark-mode requirement unless asked.
6. Never directly save, edit, restore, seed, import, export, or otherwise mutate CMS/property/Firestore/live data unless the user explicitly authorizes that exact data operation in the current turn. Data inspection for debugging must stay read-only; recovery guidance should be given as steps or text for the user to apply through the admin UI.

## Definition Of Done

- Public routes are in React
- Layout is production-clean, not starter-template quality
- Firebase deploy path is documented
- Cloud Functions public and admin APIs lint and pass release checks
- Admin/recovery actions have explicit auth and owner boundaries
- Docs stay updated when structure changes
