# How To

## Prerequisites

- Node.js 22
- npm 11+
- Firebase CLI installed and authenticated
- Google Cloud CLI (`gcloud`) installed and authenticated
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
4. If you want local scripts to target a non-default Firestore database, set `FIRESTORE_DATABASE_ID` in `functions/.env` and optionally set `FIRESTORE_ENFORCE_NON_DEFAULT=true`.
5. If you want a staging-only deployed API that reads/writes a cloned Firestore database while the public live site continues serving the live default database, set `FIRESTORE_STAGING_DATABASE_ID` in `functions/.env` to the clone database id. The deployed `siteApiStaging` function refuses to start against `(default)`.
6. If you want the admin Backups tab to start managed exports from the browser, set `FIRESTORE_BACKUP_OUTPUT_URI` in `functions/.env` to a Cloud Storage destination such as `gs://your-bucket/genericcms-firestore`.
7. If you want the Advertise form to send real email from the deployed site, also set the `SMTP_*` values in `functions/.env`. By default the form emails the public contact address from the live site shell content. `ADVERTISE_INQUIRY_TO_EMAIL` is only a backup recipient if that public address is unavailable.
8. For a live Firebase project, enable Cloud Firestore, create the default Firestore database, and enable Firebase Authentication with the Email/Password provider.

Required for the default local frontend flow:

- `VITE_API_BASE_URL=/api`

In `npm run dev`, `/api` is proxied to the local Functions emulator. If you want localhost to call a deployed Firebase API instead, set `VITE_API_BASE_URL` to the deployed API origin instead of `/api`.

Optional:

- `VITE_SITE_CONTENT_SOURCE=firebase` to read site shell and structured page content from Firebase-delivered API endpoints, with live admin editing routed through `siteApi`
- `VITE_SITE_CONTENT_SOURCE=api` to read structured page content from `siteApi`
- `VITE_PROPERTY_DATA_SOURCE=firebase` to read rental properties through Firebase-backed API endpoints and edit them through the live admin
- `VITE_CHARTER_DATA_SOURCE=firebase` to read and edit charter listings through Firebase-backed API endpoints
- `VITE_PROPERTY_DATA_SOURCE=mock` or `VITE_CHARTER_DATA_SOURCE=mock` for browser-local admin drafts
- `VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` when using the Auth emulator locally
- `VITE_ADMIN_AUTO_LOGIN_EMAIL` and `VITE_ADMIN_AUTO_LOGIN_PASSWORD` for localhost-only admin auto sign-in when you do not want to manually sign in on `/admin`
- `VITE_FIREBASE_MEASUREMENT_ID` enables Firebase/Google Analytics pageview tracking outside localhost
- `VITE_ENABLE_ANALYTICS_IN_DEV=true` allows analytics from localhost for intentional testing

The Firebase client values are required for Firebase-backed admin sign-in and live editing.

`VITE_ADMIN_AUTO_LOGIN_*` is intentionally ignored outside `localhost` / `127.0.0.1`. Keep those values in your local `.env` only and do not use them in a deployed build.

Before attempting live seed writes, run:

```bash
npm run firebase:doctor
```

That command verifies:

- Cloud Firestore API is enabled for the configured project
- the configured Firestore database id in `functions/.env` exists and is reachable
- Firebase Authentication Email/Password sign-in is configured
- Local Google application default credentials are valid for Admin SDK writes

For legacy media migration, the repo can fall back to your Firebase CLI refresh token if application default credentials are stale.

## Run The Frontend

```bash
npm run dev
```

Open the Vite URL shown in the terminal.

By default, the app reads site shell, structured pages, rental properties, and charters from the Firebase-backed API. Use the `mock` catalog modes only when you intentionally want browser-local drafts for properties or charters.

The Firebase-backed admin now uses a draft and publish workflow:

- `Save` writes the draft to Firestore without changing the public site
- After a successful save, the floating primary action switches to `Publish`
- `Publish` copies the saved draft to the public live record

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
4. If you want local or deployed Advertise-form submissions to send real email, also set the `SMTP_*` values in `functions/.env`. The recipient defaults to the public site contact email; `ADVERTISE_INQUIRY_TO_EMAIL` is only a fallback.
5. Start the emulators with `npm run emulators`.
6. Create an email/password user in the Auth emulator UI.
7. Open `/admin`, sign in, and use the tabs for Site Shell, Pages, Properties, and Charters. Public page, property, charter, and media-library reads now flow through `siteApi` or the local generated catalogs rather than direct browser reads from Firestore.

To seed Firestore with the current generated catalogs:

```bash
npm run seed:firebase-data
```

Use `npm run seed:firebase-data -- --replace` if you want to overwrite the Firestore site shell, structured pages, property catalog, and charter catalog back to the current generated baseline.

For a live Firebase project, the seed command uses the Firebase Admin SDK and needs valid Google credentials such as `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json` or refreshed application default credentials.

## Backup and restore Firestore

The primary backup/restore path now follows Firestore point-in-time recovery (PITR) instead of replaying raw JSON documents back into Firestore.

Before using it:

- enable billing for the Firebase / Google Cloud project
- create a Cloud Storage bucket for managed Firestore exports
- make sure `gcloud auth login` is pointed at the same project as `.firebaserc`

Run the dedicated recovery preflight first:

```bash
npm run firebase:doctor:recovery -- --uri=gs://your-bucket/genericcms-firestore
```

That checks:

- `gcloud` is installed
- the target Firestore database is reachable
- PITR is enabled
- `earliestVersionTime` is available
- the export bucket exists and is reachable
- the Firebase CLI and `firestore:databases:clone` command are available

To keep the live default database untouched during clone-based recovery, use the staging-only API function and Hosting preview channel:

```bash
# functions/.env
FIRESTORE_STAGING_DATABASE_ID=restore-2026-07-09
```

Then deploy the staging preview path:

```bash
npm run deploy:staging -- --channel=staging
```

That path:

- deploys only the `siteApiStaging` Cloud Function
- publishes a Firebase Hosting preview channel using [firebase.staging.json](/C:/Users/j_luc/OneDrive/Desktop/GenericCMS/firebase.staging.json)
- rewrites `/api/**` on the preview URL to `siteApiStaging`
- leaves the public live hosting site and the live `siteApi` function serving the default production database

The staging API also blocks destructive media deletes so preview testing cannot remove shared live storage assets.

`deploy:staging` also refuses to run if `VITE_API_BASE_URL` is anything other than `/api`, because an absolute API base URL would bypass the preview rewrite and hit the live API instead.

The admin workspace now also includes a `Backups` tab. That tab only exposes safe operations:

- create a managed Firestore export to `FIRESTORE_BACKUP_OUTPUT_URI`
- clone the live database into the configured staging database id
- refresh the `staging` preview channel so it serves the deployed site with `/api` routed to `siteApiStaging`
- switch public `/api` traffic between the original live database and the staging clone by changing only the live Hosting rewrite
- inspect recent backup jobs started from the admin UI

It intentionally does not offer a restore-over-live action.

The `Deploy staging preview` button in Backups is the server-side equivalent of the preview-channel part of `npm run deploy:staging -- --channel=staging`. It refreshes the deployed `staging` preview channel from the current live Hosting release and rewrites only `/api` to `siteApiStaging`. It does not build unpublished local source code from your workstation.

When you switch the public site to staging from the Backups tab, the tool does not overwrite `(default)` and does not import staging data into the live database. It clones the current live Hosting release, updates only the `/api` rewrite from `siteApi` to `siteApiStaging`, and publishes that cloned Hosting release to the live channel. Switching back to the original live database uses the same path in reverse, so rollback is just another Hosting release change.

### PITR backup

Use a managed Firestore export pinned to a PITR minute:

```bash
npm run backup:firebase-data -- --uri=gs://your-bucket/genericcms-firestore
```

The script:

- checks the target database metadata with `gcloud firestore databases describe`
- requires PITR to be enabled, or enables it first when you add `--enable-pitr`
- chooses the previous minute as the default snapshot time so the export is a consistent PITR view
- writes the export into a timestamped Cloud Storage prefix such as `gs://your-bucket/genericcms-firestore/snapshot-2026-07-09T18-22-00-000Z`

Useful options:

```bash
npm run backup:firebase-data -- --uri=gs://your-bucket/genericcms-firestore --enable-pitr
npm run backup:firebase-data -- --uri=gs://your-bucket/genericcms-firestore --snapshot-time=2026-07-09T18:22:00Z
npm run backup:firebase-data -- --uri=gs://your-bucket/genericcms-firestore --collection-ids=siteContent,structuredPages,properties
```

### PITR restore

`restore:firebase-data` is now the clone-first recovery path.

Use it to recover a PITR timestamp into a new Firestore database so you can inspect recovered data before cutover:

```bash
npm run restore:firebase-data -- --clone-to=restore-2026-07-09 --source-database=(default) --snapshot-time=2026-07-09T18:22:00Z
```

This clone path uses the Firebase CLI `firestore:databases:clone` command and is the safer recovery path when you want to validate the recovered state before making it live.

### Managed import into an existing database

If you intentionally want to import a managed export into an existing Firestore database, use the explicit import command:

```bash
npm run import:firebase-data -- --import-uri=gs://your-bucket/genericcms-firestore/snapshot-2026-07-09T18-22-00-000Z --database=(default) --yes
```

`--yes` is required when importing into the live default database so the command cannot overwrite current documents by accident.

### Portable JSON export/import

If you still want a repo-local, document-by-document export outside managed Firestore recovery, the older JSON tools are still available as secondary utilities:

```bash
npm run export:firebase-json
npm run import:firebase-json -- --dir=backups/firestore/<timestamp>
```

Those commands operate on raw collection JSON files in `backups/firestore/`. They are useful for portability and manual inspection, but PITR-managed backup/restore is now the primary recovery model.

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
