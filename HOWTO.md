# How To

## Prerequisites

- Node.js 22
- npm 11+
- Firebase CLI installed and authenticated

## Install

```bash
npm install
cd functions
npm install
cd ..
```

## Configure

1. Fill in `.env` using `.env.example`.
2. Set the Firebase project id in `.firebaserc`.

Required for the default local frontend flow:

- `VITE_API_BASE_URL=/api`

Optional:

- `VITE_PROPERTY_DATA_SOURCE=mock` to use the generated `public/livePropertyCatalog.json`
- `VITE_PROPERTY_DATA_SOURCE=api` to use `siteApi` property endpoints
- `VITE_PROPERTY_DATA_SOURCE=firebase` or `firebase-preferred` once Firebase client config is present

The Firebase client values can stay empty until auth, storage, or Firestore-backed content work starts.

## Run The Frontend

```bash
npm run dev
```

Open the Vite URL shown in the terminal.

By default, the app uses the generated snapshot catalog in `public/livePropertyCatalog.json`. Switch `VITE_PROPERTY_DATA_SOURCE` only when you want to test the API or Firebase-backed path.

## Refresh The Live Snapshot

```bash
npm run snapshot:site
```

This pulls the live site and writes:

- `reference/live-site/<date>/html/`: raw route HTML for parity checks
- `reference/live-site/<date>/snapshot.json`: extracted page metadata
- `reference/live-site/<date>/property-catalog.json`: normalized rental property records
- `src/content/liveSiteSnapshot.json`: app-facing snapshot data
- `public/livePropertyCatalog.json`: local property catalog used by the frontend mock path

## Build

```bash
npm run check
```

## Run Firebase Emulators

```bash
npm run emulators
```

Default ports:

- Hosting: `5000`
- Functions: `5001`
- Auth: `9099`
- Emulator UI: `4000`

## Deploy

```bash
npm run deploy
```

This deploys the built frontend and the Cloud Functions package, including the current public `siteApi` endpoints.

## Current Working Pattern

- Capture the live site with `npm run snapshot:site`
- Keep rebuild content driven by `src/content/liveSiteSnapshot.json`
- Keep the generated property catalog in `public/livePropertyCatalog.json`
- Keep raw reference HTML in `reference/live-site/<date>/html/`
- Keep public routes in `src/pages/`
- Keep backend endpoints in `functions/src/index.js`
- Keep in mind that `Home` and `About` are custom builds, while most other public routes still render snapshot-backed content sections
- Keep in mind that `/for-rent` cards still open the live listing pages while the local property detail flow is being finished
- Add CMS work only after the public rebuild is stable
