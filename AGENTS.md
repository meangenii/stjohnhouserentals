# AGENTS

## Current Phase

This repo is in phase one:

- Rebuild the public St. John House Rentals site in React
- Use Firebase Hosting for the frontend
- Use Cloud Functions for public API and later privileged CMS actions
- Keep content editable in code for now

Do not start the admin editor, Firestore schemas, or custom block builder unless the task explicitly asks for it.

## Product Intent

The long-term product is a focused CMS for content-driven rental sites. The short-term goal is simpler: ship a clean React version of the current public site, then replace hard-coded content with managed content later.

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
3. Keep functions small and public-safe; anything privileged should be designed for auth from the start.
4. Avoid a freeform page builder in code. The future CMS should use structured sections and controlled block types.
5. Maintain responsive behavior on desktop and mobile with no dark-mode requirement unless asked.

## Definition Of Done For Phase One

- Public routes are in React
- Layout is production-clean, not starter-template quality
- Firebase deploy path is documented
- Cloud Functions baseline exists and lints
- Docs stay updated when structure changes
