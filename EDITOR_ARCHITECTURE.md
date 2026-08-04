# Professional Page Editor Architecture

## Purpose

This document defines the architecture and delivery plan for a professional page editor for future pages in this CMS.

The editor target is the `block-page` model only. Existing scraped/current public pages should not be converted as part of this work. They can continue to use their current custom React templates and inline editable fields while the professional editor is built for new and future page layouts.

## Product Principle

The site is user-created content only. The editor may provide coded controls, validation, previews, warnings, templates, and recovery tools, but it must not generate, automate, save, publish, or control page content on behalf of the user.

Developer tooling may be used externally while writing code, but the product itself must remain deterministic user-controlled software.

## Non-Goals

- Do not convert existing St. John public pages to blocks.
- Do not change public route parity for the existing site.
- Do not build a freeform absolute-positioning canvas.
- Do not allow arbitrary editor-authored JavaScript, unrestricted HTML, or unrestricted CSS.
- Do not mutate live CMS, property, media, or Firestore data outside explicit admin save/publish actions.
- Do not generate page content or layouts inside the product.
- Do not add autonomous background systems, repair loops, or automatic publishing.
- Do not make block editing depend on generated code being deployed for every new page.

## Product Target

The editor should let an admin create professional future pages using structured, reusable content blocks. It should feel like a real page builder while keeping the site maintainable, responsive, accessible, and on-brand.

The target experience has two simultaneous surfaces:

- **Canvas:** the primary live editable page preview with desktop, tablet, and mobile modes.
- **Context panel:** a single tabbed workspace that shows either Layers or Inspector, never two persistent sidebars. Layers provides the page outline and selection; Inspector provides schema-driven controls for the selected page, block, container, style, and responsive settings.

Selecting a block or container on the Canvas exposes compact local commands without forcing a panel open. Layers and Inspector open only when requested; selecting an item from an already-open Layers panel transitions that panel to the matching Inspector. Inline text editing remains useful, but structural editing belongs in Layers and Inspector controls.

## Existing Foundation

Current useful foundations:

- `src/components/BlockPage.jsx` renders future `block-page` pages.
- `src/components/BlockList.jsx` supports add, insert, drag-sort, duplicate, hide, and delete.
- `src/lib/blockRegistry.js` registers block types and renderers.
- `src/lib/blockStyle.js` and `src/components/BlockStyleFrame.jsx` apply controlled block style options.
- `src/components/AdminPagePreview.jsx` provides edit/preview canvas modes.
- `functions/src/siteContentRepository.js` has draft/published envelopes and optimistic conflict checks.
- `src/lib/useEditLock.js` and `functions/src/editLockRepository.js` provide edit locks.
- `src/components/AdminMediaManager.jsx` provides a managed media library.

Current deliberate boundaries:

- Existing pages remain intentionally unconverted; professional composition applies only to future editor-created block pages.
- The editor is a controlled-layout system, not an arbitrary-position canvas. New block types require a coded, reviewed registry addition, while new pages and layouts do not.
- Existing version-one block content remains top-level for compatibility. The shared contract now supports independent per-type versions so future migrations can move one type at a time without rewriting unrelated records.

## Canonical Future Page Model

Future editor-created pages should normalize toward this shape:

```js
{
  key: "page-key",
  path: "/future-page",
  source: "structured",
  contentModel: "block-page",
  group: "custom",
  title: "Page title",
  navLabel: "Nav label",
  metaDescription: "Search/social description",
  routeAliases: [],
  blocks: []
}
```

Block records should normalize toward this shape:

```js
{
  id: "block-id",
  type: "hero",
  version: 1,
  data: {},
  style: {},
  responsive: {},
  visibility: {}
}
```

The current block records can be migrated gradually. Existing block renderers may continue reading their current top-level fields during the transition, but all new block infrastructure should treat `type`, `version`, `data`, `style`, `responsive`, and `visibility` as the durable contract.

## Block Definition Contract

Each block type should eventually expose:

```js
{
  type: "hero",
  version: 1,
  label: "Hero Banner",
  category: "layout",
  schema: {},
  defaultData: () => ({}),
  normalize: (block) => block,
  validate: (block) => [],
  migrate: (block) => block,
  Renderer,
  Inspector,
  allowedChildren: null,
  preview: {}
}
```

Required behavior:

- `defaultData` creates a valid block.
- `normalize` fills missing optional values and removes unsupported fields.
- `validate` returns structured errors and warnings.
- `migrate` upgrades older block versions without losing content.
- `Renderer` never crashes on incomplete block data.
- `Inspector` edits only fields declared by the schema.
- Unknown block types render a safe editor warning and a safe public fallback.

## Schema Strategy

Use local JavaScript schema definitions first. Avoid adding a heavy schema dependency until the shape stabilizes.

Schema primitives should support:

- string
- richHtml
- plainText
- number
- boolean
- enum
- link
- image
- array
- object
- blockChildren
- stylePreset
- responsiveValue

Every schema field should define:

- label
- help text
- default value
- required state
- validation rules
- inspector widget
- public rendering expectations

## Editor State Model

The editor should separate durable page data from UI state.

Durable data:

- page metadata
- block tree
- block data
- block style
- responsive and visibility settings

Session-only UI state:

- selected block id
- active inspector tab
- open panels
- drag state
- unsaved transient rich text selection
- canvas device mode
- undo/redo stack

Do not write session-only editor state into Firestore page documents.

## Inspector Architecture

The inspector should be schema-driven.

Suggested tabs:

- **Content:** text, rich text, images, links, lists, table rows.
- **Layout:** columns, card/grid behavior, width, child block slots.
- **Style:** preset, spacing, alignment, background, text color, border, radius.
- **Responsive:** desktop/mobile overrides, stack order, hide on device.
- **Settings:** block label, anchor id, visibility, advanced metadata.

The inspector should replace most block-specific inline toolbar controls over time. Inline controls can remain for fast text/media edits.

## Layout Model

Use controlled layout primitives, not absolute positioning.

Supported layout primitives:

- page
- section
- row
- column
- group/card list
- media/text split
- rich text region
- dynamic embed

Rules:

- Nesting must remain bounded.
- Columns must have mobile stack behavior.
- Width and spacing must come from tokenized presets.
- Background image controls must include alt/focal/overlay concepts when relevant.
- Blocks must be keyboard-navigable and screen-reader-safe in the public site.

## Implementation Phases

### Phase 1: Schema Foundation

Goal: make block-page data safe and checkable.

Work:

- Add schema definitions for existing block types.
- Add block/page normalize functions.
- Add block/page validation functions.
- Add migration hooks for future block versions.
- Add server-side validation before save and publish.
- Add fixture tests for valid, invalid, unknown, and legacy-shaped blocks.

Current coded slice:

- `shared/blockContract.json` is the canonical cross-runtime source for the block-page model name, current block version, supported block types, structural block types, maximum nesting depth, row column count, and row column width.
- React imports the shared contract directly. The existing content-generation pipeline copies the same JSON into the Functions deployment tree, and contract tests reject a stale generated mirror.
- Default factories, Inspector schemas, and renderer definitions assert exact key parity at module load. Adding or removing a shared block type without updating any one of those maps fails with a named contract error instead of allowing client/server drift.
- The shared contract now defines the recursive authored-content shape for all 18 block types, including nested records, controlled options, managed images, links, stable ids, and paired string-list ids.
- Client and server content validators consume that same contract, reject malformed field types and nested records before save or publish, report unsupported fields without mutating them, and enforce stable list-id alignment and uniqueness.
- Contract fixtures verify client/server issue parity, valid defaults and nested records, malformed content rejection for every block type, and preservation of unsupported fields.
- Client/server migration registries derive their keys from the shared list, and client/server validators plus row-layout controls consume the same shared structural limits.
- Every registered block now uses one canonical default-data source and exposes an explicit type and version contract.
- The Add Block workflow creates canonical versioned records instead of assembling block objects ad hoc in the UI.
- Contract fixtures verify that all 18 block defaults are isolated mutable objects, receive stable ids, stay in sync with the server-supported type list, and pass both client and server structural validation.
- Every registered client block definition exposes the same migration hook, backed by an ordered migration registry rather than ad hoc load-time mutation.
- Client and server migration contracts upgrade explicit version-zero records to version one, preserve custom fields, stable ids, nested rows/groups, and the original input object, and produce the same structured migration report.
- Existing records with no version remain compatible as version one and are not reported as a conversion, avoiding a bulk rewrite of existing pages.
- Malformed versions, missing migration steps, invalid migration output, and future block versions produce structured validation errors and remain blocked from save or publish.
- Migration runs on cloned values during client validation and server normalization. It never writes content itself; a migrated record is persisted only as part of an explicit save, publish, or revision-restore action.
- Unknown block records remain intact and blocked by client/server validation. The editor renders a selectable warning with normal structural commands, while public rendering shows a neutral unavailable-section fallback without exposing type or payload data.
- Migration parity and unknown-block preservation are fixture-tested, and the browser interaction suite verifies both the editor warning and public fallback.

### Phase 2: Editor Shell

Goal: make the editor feel like a professional tool.

Work:

- Add a contextual Layers/Inspector panel beside the primary Canvas.
- Add selected block model shared by layers, canvas, and inspector.
- Keep context panels closed until requested and preserve a full-width Canvas as the default workspace.
- Add command bar for add, duplicate, hide, delete, move, undo, redo.
- Keep existing canvas rendering path.

Current coded slice:

- A development-only page editor harness renders the production Layers, Canvas, Inspector, validation, and history components without authentication or CMS API access.
- The harness is excluded from production builds and stores a saved fixture only in browser session storage after an explicit user action.
- A deterministic Playwright scenario now covers new empty page creation, add, Inspector field edit, insert, duplicate, move up, move down, hide, show, delete, undo, redo, explicit save, reload, and browser refresh recovery.
- The browser scenario is part of `npm run check`; it does not save, publish, seed, or otherwise mutate site content.

### Phase 3: Schema-Driven Inspector

Goal: remove ad hoc field editing from block renderers.

Work:

- Create reusable inspector field components.
- Generate content controls from schema.
- Generate style controls from controlled style definitions.
- Add link picker and route picker.
- Add media picker integration.
- Add array/list editors with stable ids.

Current coded slice:

- The page-level inspector now edits the canonical page URL, URL aliases, navigation label, navigation group, title, and search description.
- The editor shell is canvas-first and never presents three simultaneous columns. Layers and Inspector share one accessible contextual panel with tab and arrow-key navigation; it is closed by default and can be dismissed without clearing Canvas selection.
- Canvas selection uses a compact icon toolbar with accessible names and tooltips. Reorder, duplicate, visibility, delete, insert, background, nested-card, and repeating-item commands avoid persistent text-heavy command rows.
- Selecting from an open Layers panel transitions to Inspector, while Canvas selection alone does not force the panel open.
- Preview and saved-revision views remove the editing context panel and expand the Canvas to the full workspace.
- Page checks, change summaries, and revision history are removed from the default page flow and opened one at a time from icon buttons beside Undo and Redo.
- Long revision histories scroll inside a bounded workspace, and their refresh, preview, restore, and close commands use accessible icon buttons.
- Revision history is fetched only when the admin opens its toolbar view; page load, no-change reload, save, and publish do not make a background revision request.
- URL aliases use explicit add, edit, normalize, and remove controls with a fixed maximum rather than an unrestricted text blob.
- Page route edits participate in the existing undo/redo history, dirty-state checks, publish diff, revisions, and manual save/publish workflow.
- Client validation blocks malformed paths, reserved namespaces, duplicate page URLs, and collisions with static or structured page routes before save.
- Independent server validation enforces the same route shape and reserved namespaces and rechecks static, draft, and published route ownership during save, publish, and revision restore.
- Image schema fields now render a reusable managed-media inspector control for hero, image/text split, standalone image, gallery image, repeating-card image, and block background fields.
- Selecting a managed image is a single undoable user action that preserves authored alt/title metadata, adopts available library metadata for empty fields, records natural dimensions, and resets stale manual sizing.
- Replacing or clearing an image removes obsolete bundled/source metadata so an old image cannot reappear as a fallback.
- Images can be explicitly marked decorative; decorative public images render with empty alt text while meaningful images continue to produce missing-alt readiness warnings.
- The schema-driven inspector does not expose arbitrary image URL editing for block pages; image selection stays within the existing managed media library and server storage policy.
- The Settings tab now supports an optional editor-only label for durable layer naming and an optional public section anchor for direct links.
- Editor labels update the layers panel and inspector without changing public content or block type identity.
- Section anchors normalize through a controlled slug function, render only when valid, cannot reuse reserved site-interface ids, and are checked for uniqueness across top-level and nested row/group blocks by both client and server validation.
- Duplicating any block tree preserves editor labels but clears public anchors from the duplicated block and every nested descendant, preventing duplicate DOM ids.
- Row blocks now expose a dedicated Layout tab with controlled one-to-four-column presets, custom width ratios, and explicit column reordering.
- Applying a smaller row layout preserves authored content by moving blocks from removed columns into the final retained column in reading order.
- The canvas row-layout control and Inspector use the same tested layout transform, keeping both editing surfaces behaviorally consistent.
- Row columns and group cards are now first-class selectable containers in Layers and Canvas using session-only selection tokens derived from their existing stable ids.
- Selecting a container opens the matching Inspector controls: card content and managed media, column width, controlled container styles, and read-only identity details.
- Container selection remains editor UI state and does not add selection metadata to saved or published page documents.
- Structured validation issues now retain machine-readable field paths in addition to display paths.
- Page-check rows navigate to the owning page, block, row column, or group card; Layers shows per-node error/warning counts, and the Inspector lists checks for the current selection.
- Selecting an Inspector check opens the relevant Content, Layout, Style, Responsive, or Settings tab without changing page data.
- Schema content controls, page routing/SEO fields, block identity fields, managed-media groups, card fields, and column widths now show inline error or warning messages for their exact structured path.
- Invalid controls expose `aria-invalid` and visible severity styling while retaining the Inspector-level summary for issues that apply to an entire block or container.
- Schedule columns, times, and notes; rate rows, values, and footer lines; and business phone numbers now use reusable schema-generated Inspector list controls with add, edit, reorder, and delete commands.
- Primitive string-list controls update authored values and their stable ids in one draft transaction. Canvas add/remove commands use the same atomic behavior, so one Undo cannot leave paired arrays out of alignment.
- A dedicated Playwright workflow creates and edits all three formerly partial block types, verifies one-step Undo for canvas list actions, saves the fixture, reloads it, and checks exact value/id alignment.
- Repeating features, testimonials, gallery images, contact details, schedule columns, rate rows, group cards, and business records now use one canonical item factory from both Canvas and Inspector insertion paths.
- Contact-detail Inspector controls respond to the selected text, phone, or link type without exposing irrelevant duplicate fields, and content-readiness link checks follow the same selected type.
- Hero and CTA button colors now use a controlled palette/custom color widget backed by matching client/server color validation instead of an unrestricted Inspector text field.
- Browser authoring workflows now exercise all 18 registered block types through production Canvas and Inspector controls. The comprehensive workflow authors the 13 content, media, and structural types not previously covered end to end, then explicitly saves, reloads, and verifies their stored records.
- The comprehensive workflow verifies rich text, links, managed-image metadata, decorative-image state, controlled colors, repeating items, dynamic-directory source selection, disabled form submission while editing, group-card container selection, row presets, column width Undo, and exact saved block order.
- Structural row layout and selected-column width controls now expose explicit accessible names, matching the accessibility contract already used by schema-generated fields.
- Editable links now declare inline or button presentation. Inline content links share the site's tokenized color, underline, hover, and focus treatment across public rendering, preview, and Canvas editing, while navigation and button links remain excluded.

### Phase 4: Responsive Design Controls

Goal: make future pages reliable on desktop and mobile.

Work:

- Add responsive preview presets.
- Add column mobile stack controls.
- Add per-device visibility controls.
- Add focal point and background overlay controls.
- Add responsive validation warnings.

Current coded slice:

- `visibility.hideOnDesktop` and `visibility.hideOnMobile` are controlled through the block inspector and rendered through deterministic CSS classes.
- Tablet is a first-class preview and visibility target through `visibility.hideOnTablet`.
- `responsive.mobileColumns` controls row behavior on mobile with `stack` and `preserve` options.
- Stacked mobile rows support a deterministic per-column order without changing desktop/tablet reading order.
- `style.background.focalPoint` controls image positioning through fixed focal-point options.
- `style.background.overlay` controls fixed light, dark, and brand overlays for image-backed blocks.
- Client and server validation reject malformed responsive/visibility shapes, normalize unsupported responsive/background style options, warn when a block is hidden on every device, and warn when an image background has no overlay.

### Phase 5: Publishing Safety and QA

Goal: make editor output safe to publish.

Work:

- Add per-page revision history.
- Add restore revision.
- Add publish diff.
- Add visual screenshot checks.
- Add accessibility checks for block pages.
- Add content warnings before publish.

Current coded slice:

- Admin structured page responses include a read-only `publishedPage` snapshot alongside the editable draft.
- The page editor shows unsaved draft changes before saving and saved publish changes before publishing live.
- The diff reports metadata changes plus added, removed, moved, type-changed, and updated blocks.
- Diff behavior is covered by pure fixture tests and does not publish, save, generate, or mutate content by itself.
- The editor runs content-readiness warnings for placeholder text, empty containers, incomplete links, and missing image alt text before save or publish.
- Server-side structured page saves and publishes now create deterministic revision records with actor, timestamp, page identity, block count, action, and a full page snapshot.
- Revision history is capped at 80 snapshots per page, and the retention selector has direct fixture coverage.
- The admin API and client repository can list page revision summaries and restore a selected revision back to draft without publishing it live.
- The page editor shows a manual revision history panel with refresh, read-only preview, comparison, and restore actions. Restore remains an explicit admin action and publishing remains separate.
- Draft save and live publish are separate commands. Publish cannot run while unsaved edits exist.
- Optimistic conflicts preserve the local draft and latest saved baseline, with explicit keep-local, use-latest, and JSON download recovery actions.
- Edit leases include a unique browser-session id and are verified inside page save, publish, restore, reset, and delete transactions. A second tab under the same account cannot share the first tab's lease.
- Custom page deletion creates a recoverable tombstone, immediately removes public access, preserves revision history, and restores only to an unpublished draft. Seeded pages retain their reset-to-seed behavior.
- Undo history coalesces rapid field edits, stores path-level values where possible, and is capped by entry count and serialized byte size.
- Rich text rendering and paste normalization now have fixture coverage for unsafe tags, unsafe event attributes, unsafe links, controlled external-link attributes, internal site URL rewriting, escaped HTML, and plain-text escaping.
- Block link records now normalize legacy/current site URLs to internal routes when no explicit external type is set, normalize protocol-relative external URLs to HTTPS, reject unsupported schemes, and keep external new-tab links on fixed `rel`/`target` attributes.
- Content-readiness warnings now flag unsafe block link destinations before save or publish.
- Accessibility readiness checks now evaluate desktop and mobile heading outlines, including device visibility, nested structural blocks, and headings authored inside rich text.
- The checks warn about missing or multiple level-one headings, skipped heading levels, empty rich-text headings or links, and non-descriptive link labels.
- Schedule and rate-table renderers now use a consistent public heading hierarchy (`h2` section titles and `h3` schedule column titles).
- Publish diffs now report navigation group and URL alias changes alongside title, navigation label, URL path, and search description changes.
- A local-only Auth, Functions, and Firestore emulator workflow now exercises both the real admin HTTP API and the production `/admin` browser UI under a guarded `demo-` project. It never imports, exports, or connects to persistent CMS data.
- The workflow verifies unauthenticated write rejection, authenticated first save, private drafts, optimistic save and publish conflicts with latest-record responses, explicit publication, later private draft changes, public reads, and revision actor/action records.
- The browser workflow creates a page, authors a block, saves, publishes, opens a revision preview, moves the page to trash, restores it, and confirms recovery stays private.
- `/admin` no longer depends on a successful public site-shell preload, preserving access to recovery tools when public content is missing or damaged.
- Playwright screenshot baselines cover desktop, tablet, and mobile editor workspaces. DOM assertions reject horizontal overflow and overlapping panel layouts.
- A dedicated visual fixture verifies that review panels are absent until requested, their toolbar consumes less than 70 pixels, only one review view is mounted at a time, a 40-entry revision history stays bounded, and the workflow passes an Axe scan.
- Admin page API route tests prove that `/pages/:key/revisions` and its trailing-slash form cannot fall through as a page document id such as `test/revisions`.
- Axe scans the rendered editor DOM, and keyboard tests enforce roving arrow-key navigation for Inspector tabs.
- Publication-envelope normalization now preserves an explicit `published: null`; creating a first draft can no longer leak that draft through public reads before the user publishes it.
- Firebase CLI tooling is pinned as a development dependency. `npm run check:editor-release` runs the complete static/browser suite followed by the authenticated emulator gate.

## Testable Outcomes

The following outcomes define when the professional editor is real enough to trust.

### Data and Schema

- Creating a new page produces a valid `block-page` document.
- Every registered block can produce valid default data.
- Invalid block types are rejected or safely isolated.
- Missing required fields produce validation errors before publish.
- Unsupported extra fields are normalized or reported.
- Existing custom pages remain unchanged and are not converted.
- Server validation rejects malformed block-page payloads.
- Server validation rejects invalid external image references according to existing media policy.
- Older block versions can be migrated by deterministic migration functions.
- Validation errors are structured enough for the UI to show field-level messages.

### Editor UX

- An admin can create a new page, add blocks, edit content, save draft, reload, and see the same block tree.
- An admin can publish the saved draft and view the public page at the configured route.
- Selecting a block in the canvas selects the same block in layers and inspector.
- Selecting a block in layers selects the same block in the canvas and inspector.
- Layers and Inspector occupy one contextual panel, so the editor never requires three simultaneous columns.
- The Canvas remains full width until an admin explicitly opens Layers or Inspector, and closing the panel does not clear the selected block.
- Canvas command bars use compact icon buttons with accessible labels and do not cover authored block content.
- Add, duplicate, hide, show, delete, move up, move down, and drag-sort work for top-level blocks.
- Nested row/column and group/card blocks respect the maximum nesting depth.
- Undo and redo work for structural edits and field edits.
- Inspector controls never expose unsupported fields for the selected block type.
- Empty pages and empty containers show useful add-block affordances.
- Editor UI controls do not appear on the public rendered site.
- An admin can assign a durable editor label without changing the block's public content.
- An admin can assign a safe section anchor and navigate directly to it with a URL fragment.
- Duplicate or malformed section anchors block save on both the client and server, including collisions inside nested rows and groups.
- Duplicating an anchored block produces an unanchored copy rather than duplicate public DOM ids.
- An admin can change row column count, ratios, and order from the Inspector without editing code.
- Reducing a row's column count preserves every nested content block and its stable id.
- Selecting a row column or group card in Layers selects the same container in the Canvas and Inspector.
- Container style edits use the same controlled style contract as blocks and participate in undo, redo, save, diff, and revisions.
- Validation errors and warnings identify their owning editor node and can be reached without manually decoding a stored data path.
- Validation navigation never edits, repairs, saves, or publishes content automatically.
- Field-level validation messages clear deterministically when the corresponding user edit resolves the underlying issue.

### Rendering

- Public rendering never crashes on missing optional block fields.
- Hidden blocks are omitted from public rendering.
- Per-device hidden blocks are omitted for the matching desktop or mobile presentation.
- Unknown blocks do not crash the public site.
- Desktop and mobile preview render without horizontal overflow.
- Rows stack predictably on mobile unless a row is explicitly set to preserve columns.
- Rich text output is sanitized and cannot inject scripts, forms, iframes, or unsafe links.
- Links use internal routing where appropriate and safe external attributes where needed.
- Media renders with alt text controls and stable sizing.
- Managed image selection works from the inspector for single images, gallery items, repeating cards, and block backgrounds.
- Clearing or replacing an image cannot leave a stale source reference, and decorative images render with empty alt text.

### Styling

- Blocks can use site style presets.
- Blocks can reset to default style.
- Custom block styling stays within controlled width, spacing, background, color, border, and radius options.
- Background image focal point and overlay controls stay within fixed editor-supported options.
- Background images use managed media and do not accept unsafe external storage references.
- Text remains readable when background colors or images are applied.
- Responsive controls do not create overlapping or clipped content on mobile.

### Publishing and Recovery

- Unsaved changes are detected before navigation.
- Concurrent edits produce a conflict instead of silently overwriting.
- Edit locks prevent two admins from editing the same page at the same time.
- Save draft and publish are separate operations.
- Page URL and aliases cannot use reserved namespaces, malformed paths, duplicate one another, or collide with another static, draft, or published page.
- Publish is blocked when validation errors exist.
- Page revision history records who changed what and when.
- A prior revision can be restored to draft without immediately publishing.
- A publish diff shows metadata changes, block additions, removals, moves, and field changes.
- Content readiness warnings identify placeholder text, missing image alt text, incomplete CTA links, empty lists, and empty layout containers before publish.

### Verification Checks

- `npm run lint` passes.
- `npm run build` passes.
- Block schema fixtures pass.
- Server-side page validation fixtures pass.
- Editor interaction tests pass for create, add, edit, move, duplicate, hide, delete, save, reload.
- `npm run check:editor-release` passes the authenticated draft, conflict, publish, public-read, and revision workflow against disposable local emulators.
- Rich text sanitizer tests pass for paste and unsafe HTML.
- Responsive screenshot checks pass for representative block pages.
- Accessibility checks pass for public block pages.
- Every registered block default passes the client and server block-page contracts.

## Definition of Done

The professional editor is done when a non-developer admin can create a new custom page from scratch, compose a polished responsive layout from supported blocks, save and publish it safely, recover from mistakes, and do all of that without developer changes or risk to existing public pages.
