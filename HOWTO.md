# How To

## Prerequisites

- Node.js 22
- npm 11+
- Firebase CLI installed and authenticated
- Google application default credentials or a service-account key for live Firestore seed writes

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
3. If you want shared live editing, copy `functions/.env.example` to `functions/.env` and set `ADMIN_ALLOWED_EMAILS`.
4. For a live Firebase project, enable Cloud Firestore, create the default Firestore database, and enable Firebase Authentication with the Email/Password provider.

Required for the default local frontend flow:

- `VITE_API_BASE_URL=/api`

In `npm run dev`, `/api` is proxied to the local Functions emulator. If you want localhost to call a deployed Firebase API instead, set `VITE_API_BASE_URL` to the deployed API origin instead of `/api`.

Optional:

- `VITE_SITE_CONTENT_SOURCE=local` to read structured page content directly from `shared/siteContent.js`
- `VITE_SITE_CONTENT_SOURCE=api` to read structured page content plus rental/charter catalogs from `siteApi`
- `VITE_SITE_CONTENT_SOURCE=firebase` or `firebase-preferred` for Firebase-delivered page shell content
- `VITE_PROPERTY_DATA_SOURCE=firebase` to read rental properties from the live Firestore `cmsProperties` collection when `VITE_API_BASE_URL` points at a deployed API, and edit through Firebase-backed admin endpoints
- `VITE_CHARTER_DATA_SOURCE=firebase` to read and edit charter listings through Firebase-backed API endpoints
- `VITE_PROPERTY_DATA_SOURCE=mock` or `VITE_CHARTER_DATA_SOURCE=mock` for browser-local admin drafts
- `VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` when using the Auth emulator locally

The Firebase client values are required for Firebase-backed admin sign-in and live editing.

Before attempting live seed writes, run:

```bash
npm run firebase:doctor
```

That command verifies:

- Cloud Firestore API is enabled for the configured project
- Firebase Authentication Email/Password sign-in is configured
- Local Google application default credentials are valid for Admin SDK writes

## Run The Frontend

```bash
npm run dev
```

Open the Vite URL shown in the terminal.

By default, the app reads structured singleton page content from `shared/siteContent.js` and uses the generated rental and charter catalogs in `public/`. Switch `VITE_SITE_CONTENT_SOURCE` only when you want to test the API or Firebase-backed path.

## Refresh The Live Snapshot

```bash
npm run snapshot:site
```

This pulls the live site and writes:

- `reference/live-site/<date>/html/`: raw route HTML for parity checks
- `reference/live-site/<date>/snapshot.json`: extracted page metadata
- `reference/live-site/<date>/property-catalog.json`: normalized rental property records
- `reference/live-site/<date>/charter-catalog.json`: normalized charter records when available
- `src/content/liveSiteSnapshot.json`: app-facing snapshot data
- `public/livePropertyCatalog.json`: local property catalog used by the frontend mock path
- `public/livePropertySummaryCatalog.json`: local rental summary catalog used by filtered listing views
- `public/liveCharterCatalog.json`: local charter catalog used by detail routes

## Build

```bash
npm run check
```

`npm run build`, `npm run emulators`, and `npm run deploy` all run `npm run content:generate` first so Cloud Functions only reads content artifacts inside `functions/src/generated/`.

## Run Firebase Emulators

```bash
npm run emulators
```

Default ports:

- Hosting: `5000`
- Functions: `5001`
- Auth: `9099`
- Firestore: `8080`
- Emulator UI: `4000`

For end-to-end live editing in local development:

1. Set `VITE_PROPERTY_DATA_SOURCE=firebase` and/or `VITE_CHARTER_DATA_SOURCE=firebase`.
2. Fill in the Firebase client config values in `.env`.
3. Copy `functions/.env.example` to `functions/.env` and set `ADMIN_ALLOWED_EMAILS`.
4. Start the emulators with `npm run emulators`.
5. Create an email/password user in the Auth emulator UI.
6. Open `/admin`, sign in, and save changes. Public property routes will read `cmsProperties` directly from Firestore in the live-hosted API flow, while `/api` emulator setups continue through `siteApi`.

To seed Firestore with the current generated catalogs:

```bash
npm run seed:firebase-data
```

Use `npm run seed:firebase-data -- --replace` if you want to overwrite the Firestore property and charter collections back to the current generated baseline.

For a live Firebase project, the seed command uses the Firebase Admin SDK and needs valid Google credentials such as `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json` or refreshed application default credentials.

## Deploy

```bash
npm run deploy
```

This deploys the built frontend plus Cloud Functions, including the current public `siteApi` endpoints.

It does not deploy Firestore rules or indexes by default. That keeps first deploys working on Firebase projects that do not have a default Firestore database yet.

After the default Firestore database exists, deploy Firestore config with:

```bash
npm run deploy:firestore
```

## Current Working Pattern

- Keep structured singleton page content in `shared/siteContent.js`
- Keep migrated static rich-text route content in `shared/migratedSnapshotContent.js`
- Keep React-only asset resolution in `src/lib/contentAssets.js`
- Keep the frontend content access boundary in `src/lib/siteContentRepository.js`
- Use `siteApi` content and catalog endpoints when you want Firebase-style delivery without changing page components
- Use direct Firestore reads in `firebase` mode for the public `cmsProperties` catalog when `VITE_API_BASE_URL` targets the deployed API instead of `/api`
- Use Firestore-backed canonical property and charter collections, with generated catalogs as the seed fallback when Firestore is empty
- Keep the generated rental and charter catalogs in `public/`
- Capture the live site with `npm run snapshot:site` for parity checks and to refresh the local seed catalogs
- Keep raw reference HTML in `reference/live-site/<date>/html/`
- Keep public routes in `src/pages/`
- Keep backend endpoints in `functions/src/index.js`
- Let `npm run content:generate` mirror the shared seed documents and public catalogs into `functions/src/generated/`
- Add CMS work only after the public rebuild is stable
