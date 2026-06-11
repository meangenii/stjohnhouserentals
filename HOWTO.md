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
- `VITE_SITE_CONTENT_SOURCE=api` to read structured page content from `siteApi`
- `VITE_SITE_CONTENT_SOURCE=firebase` or `firebase-preferred` for Firebase-delivered site shell and structured page content, with live admin editing routed through `siteApi`
- `VITE_PROPERTY_DATA_SOURCE=firebase` to read rental properties through Firebase-backed API endpoints and edit them through the live admin
- `VITE_CHARTER_DATA_SOURCE=firebase` to read and edit charter listings through Firebase-backed API endpoints
- `VITE_PROPERTY_DATA_SOURCE=mock` or `VITE_CHARTER_DATA_SOURCE=mock` for browser-local admin drafts
- `VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` when using the Auth emulator locally
- `VITE_ADMIN_AUTO_LOGIN_EMAIL` and `VITE_ADMIN_AUTO_LOGIN_PASSWORD` for localhost-only admin auto sign-in when you do not want to manually sign in on `/admin`

The Firebase client values are required for Firebase-backed admin sign-in and live editing.

`VITE_ADMIN_AUTO_LOGIN_*` is intentionally ignored outside `localhost` / `127.0.0.1`. Keep those values in your local `.env` only and do not use them in a deployed build.

Before attempting live seed writes, run:

```bash
npm run firebase:doctor
```

That command verifies:

- Cloud Firestore API is enabled for the configured project
- Firebase Authentication Email/Password sign-in is configured
- Local Google application default credentials are valid for Admin SDK writes

For legacy media migration, the repo can fall back to your Firebase CLI refresh token if application default credentials are stale.

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

- `reference/live-site/<date>/html/`: sanitized route HTML for parity checks
- `reference/live-site/<date>/snapshot.json`: extracted page metadata
- `reference/live-site/<date>/property-catalog.json`: normalized rental property records, including `templateVariant`
- `reference/live-site/<date>/charter-catalog.json`: normalized charter records when available
- `src/content/liveSiteSnapshot.json`: app-facing snapshot data
- `public/livePropertyCatalog.json`: local property catalog used by the frontend mock path
- `public/livePropertySummaryCatalog.json`: local rental summary catalog used by filtered listing views
- `public/liveCharterCatalog.json`: local charter catalog used by detail routes

## Analyze Rental Listing Patterns

```bash
npm run analyze:listings
```

This reads the latest `reference/live-site/<date>/property-catalog.json` scrape and writes:

- `reference/live-site/<date>/listing-pattern-report.json`: machine-readable pattern summary and per-listing assignments
- `reference/live-site/<date>/listing-pattern-report.md`: readable report with booking-flow counts, content signals, archetypes, and top partner domains

Use `npm run analyze:listings -- --date=YYYY-MM-DD` if you want to analyze an older snapshot instead of the latest one.

## Audit Property Template Parity

```bash
npm run audit:property-template
```

This audits the current property detail template against the scraped rental property catalog and writes:

- `reference/live-site/<date>/property-template-parity-audit.json`: machine-readable per-property parity status
- `reference/live-site/<date>/property-template-parity-audit.md`: readable audit summary

Property template variants are defined in `shared/propertyTemplateVariants.json`. The current live snapshot assigns `fully-sectioned` to scraped properties so the public renderer and admin preview preserve the live-site section headers, including empty shells like `Reviews` when the live template still defines that slot.

Use `npm run audit:property-template -- --date=YYYY-MM-DD` to audit an older snapshot.

## Build And Deploy In VS Code

Use the built-in VS Code tasks when you want the simplest publish path.

- Open this project in VS Code.
- Choose `Terminal > Run Task...`.
- Choose `Build` if you only want to confirm the site compiles successfully.
- Choose `Build and Deploy` when you are ready to publish the current site.
- Wait for the task to finish before closing VS Code.
- A successful deploy ends with Firebase confirming that hosting and functions were deployed.

Important:

- The computer must already be signed into the correct Firebase account for this project.
- `Build and Deploy` publishes the frontend and Cloud Functions.
- It does not publish Firestore rules, Firestore indexes, or Storage rules.
- If the task fails, send the final error message to the person maintaining the project rather than retrying blindly.

## Build

```bash
npm run check
```

`npm run check` now also runs `npm run assert:no-legacy-vendor` and fails if any forbidden legacy vendor string reappears in the repo.

`npm run build`, `npm run emulators`, and `npm run deploy` all run `npm run content:generate` first so Cloud Functions only reads content artifacts inside `functions/src/generated/`.

For the standard VS Code build button path, use the `Build` task. The terminal equivalent is:

```bash
npm run build
```

## Migrate Legacy Media

```bash
npm run media:migrate
```

This command:

- provisions the default Firebase Storage bucket when the project has not used Firebase Storage yet
- uploads legacy-hosted images into Firebase Storage under page-, property-, and charter-based paths
- writes media records to Firestore under `cmsMediaLibrary`
- rewrites the live Firestore content documents to Firebase Storage URLs
- rewrites the tracked local seed/source files and refreshes the media manifest in `shared/mediaCatalog.js`

Deploy the Storage rules after the first migration with:

```bash
npm run deploy:storage
```

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
6. Open `/admin`, sign in, and use the tabs for Site Shell, Pages, Properties, and Charters. Public page, property, charter, and media-library reads now flow through `siteApi` or the local generated catalogs rather than direct browser reads from Firestore.

To seed Firestore with the current generated catalogs:

```bash
npm run seed:firebase-data
```

Use `npm run seed:firebase-data -- --replace` if you want to overwrite the Firestore site shell, structured pages, property catalog, and charter catalog back to the current generated baseline.

For a live Firebase project, the seed command uses the Firebase Admin SDK and needs valid Google credentials such as `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json` or refreshed application default credentials.

## Deploy

```bash
npm run deploy
```

This deploys the built frontend plus Cloud Functions, including the current public `siteApi` endpoints.

For the standard VS Code publish path, use the `Build and Deploy` task instead of running terminal commands manually.

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
- Use Firebase-backed API responses in `firebase` mode for the public property and charter catalogs
- Use Firestore-backed canonical site shell, structured page, property, and charter documents for live admin editing
- Keep all active site images on Firebase Storage URLs; admin saves now reject bundled or third-party image URLs
- Keep the generated rental and charter catalogs in `public/`
- Capture the live site with `npm run snapshot:site` for parity checks and to refresh the local seed catalogs
- Keep sanitized reference HTML in `reference/live-site/<date>/html/`
- Keep public routes in `src/pages/`
- Keep backend endpoints in `functions/src/index.js`
- Let `npm run content:generate` mirror the shared seed documents and public catalogs into `functions/src/generated/`
- Use `/admin` as the structured Firebase-backed editing surface instead of editing content documents manually in the console
