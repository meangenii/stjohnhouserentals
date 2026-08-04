import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { BLOCK_DEFINITION_VERSION } from '../src/lib/blockDefaults.js'
import { migrateBlockPageDraft, migrateBlockRecord } from '../src/lib/blockMigrations.js'
import { validateEditorBlockPageDraft } from '../src/lib/blockPageValidation.js'

const require = createRequire(import.meta.url)
const {
  CURRENT_BLOCK_VERSION: SERVER_BLOCK_VERSION,
  migrateBlockPageDraft: migrateServerBlockPageDraft,
  migrateBlockRecord: migrateServerBlockRecord,
} = require('../functions/src/blockMigrations.js')
const { validateBlockPageDraft } = require('../functions/src/blockPageSchema.js')

assert.equal(SERVER_BLOCK_VERSION, BLOCK_DEFINITION_VERSION, 'Client and server current block versions must match.')

const legacyHero = {
  action: { label: 'Keep this action', path: '/contact-us' },
  id: 'legacy-hero',
  customLegacyField: { retained: true },
  title: 'Keep this title',
  type: 'hero',
  version: 0,
}
const legacyHeroSnapshot = JSON.stringify(legacyHero)
const clientHeroMigration = migrateBlockRecord(legacyHero, { path: ['blocks', 0] })
const serverHeroMigration = migrateServerBlockRecord(legacyHero, { path: ['blocks', 0] })

assert.equal(clientHeroMigration.migrated, true)
assert.equal(clientHeroMigration.block.version, BLOCK_DEFINITION_VERSION)
assert.equal(clientHeroMigration.block.title, legacyHero.title)
assert.deepEqual(clientHeroMigration.block.customLegacyField, legacyHero.customLegacyField)
assert.deepEqual(clientHeroMigration, serverHeroMigration, 'Client and server block migration reports must match.')
assert.equal(JSON.stringify(legacyHero), legacyHeroSnapshot, 'Migration must not mutate its input block.')

const legacyNestedPage = {
  blocks: [
    {
      columns: [
        {
          blocks: [
            {
              html: '<p>Nested content survives.</p>',
              id: 'legacy-rich-text',
              type: 'rich-text',
              version: 0,
            },
          ],
          id: 'legacy-column',
          width: 1,
        },
      ],
      id: 'legacy-row',
      type: 'row',
      version: 0,
    },
  ],
  contentModel: 'block-page',
  group: 'custom',
  metaDescription: 'A deterministic nested migration fixture.',
  navLabel: 'Legacy Fixture',
  path: '/legacy-fixture',
  routeAliases: [],
  title: 'Legacy Fixture',
}
const legacyNestedSnapshot = JSON.stringify(legacyNestedPage)
const firstPageMigration = migrateBlockPageDraft(legacyNestedPage)
const secondPageMigration = migrateBlockPageDraft(legacyNestedPage)
const serverPageMigration = migrateServerBlockPageDraft(legacyNestedPage)

assert.equal(firstPageMigration.migrated, true)
assert.equal(firstPageMigration.migrations.length, 2)
assert.deepEqual(
  firstPageMigration.migrations.map((migration) => migration.path),
  ['page.blocks[0]', 'page.blocks[0].columns[0].blocks[0]'],
)
assert.equal(firstPageMigration.page.blocks[0].version, BLOCK_DEFINITION_VERSION)
assert.equal(firstPageMigration.page.blocks[0].columns[0].blocks[0].version, BLOCK_DEFINITION_VERSION)
assert.equal(firstPageMigration.page.blocks[0].columns[0].blocks[0].id, 'legacy-rich-text')
assert.equal(firstPageMigration.page.blocks[0].columns[0].blocks[0].html, '<p>Nested content survives.</p>')
assert.deepEqual(firstPageMigration, secondPageMigration, 'The same migration input must always produce the same output.')
assert.deepEqual(firstPageMigration, serverPageMigration, 'Client and server page migration reports must match.')
assert.equal(JSON.stringify(legacyNestedPage), legacyNestedSnapshot, 'Page migration must not mutate its input page.')

const clientLegacyValidation = validateEditorBlockPageDraft(legacyNestedPage)
const serverLegacyValidation = validateBlockPageDraft(legacyNestedPage)
assert.equal(clientLegacyValidation.valid, true)
assert.equal(serverLegacyValidation.valid, true)
assert.equal(clientLegacyValidation.migrations.length, 2)
assert.equal(serverLegacyValidation.migrations.length, 2)
assert.equal(serverLegacyValidation.normalizedPage.blocks[0].version, BLOCK_DEFINITION_VERSION)

const versionlessRecord = migrateBlockRecord({ id: 'versionless', title: 'Existing compatible block', type: 'hero' })
assert.equal(versionlessRecord.migrated, false, 'Existing versionless blocks remain compatible without a reported conversion.')
assert.equal(versionlessRecord.block.version, BLOCK_DEFINITION_VERSION)

const futureRecord = migrateBlockRecord({ id: 'future', type: 'hero', version: BLOCK_DEFINITION_VERSION + 1 }, { path: ['blocks', 0] })
assert.equal(futureRecord.migrated, false)
assert.ok(futureRecord.errors.some((error) => error.code === 'unsupported-block-version'))
assert.ok(
  validateEditorBlockPageDraft({ ...legacyNestedPage, blocks: [futureRecord.block] }).errors.some(
    (error) => error.code === 'unsupported-block-version',
  ),
)
assert.ok(
  validateBlockPageDraft({ ...legacyNestedPage, blocks: [futureRecord.block] }).errors.some(
    (error) => error.code === 'unsupported-block-version',
  ),
)

const invalidVersionRecord = migrateBlockRecord({ id: 'invalid-version', type: 'hero', version: 0.5 })
assert.ok(invalidVersionRecord.errors.some((error) => error.code === 'invalid-block-version'))

const unknownBlock = { id: 'unknown', payload: { mustSurvive: true }, type: 'retired-promo', version: 4 }
const unknownMigration = migrateBlockRecord(unknownBlock)
assert.equal(unknownMigration.supported, false)
assert.equal(unknownMigration.migrated, false)
assert.deepEqual(unknownMigration.block, unknownBlock, 'Unknown block payloads must remain intact.')

console.log('Block migration contract tests passed.')
