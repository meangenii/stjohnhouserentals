import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import sharedBlockContract from '../shared/blockContract.json' with { type: 'json' }
import {
  BLOCK_CONTENT_SCHEMAS,
  BLOCK_DEFINITION_VERSION,
  BLOCK_ELEMENT_STYLE_TARGETS,
  BLOCK_PAGE_CONTENT_MODEL,
  BLOCK_RESPONSIVE_OPTIONS,
  BLOCK_STYLE_OPTIONS,
  BLOCK_TYPES,
  BLOCK_VERSIONS,
  getBlockDefinitionVersion,
  MAX_ROW_COLUMNS,
  MAX_ROW_COLUMN_WIDTH,
  MAX_STRUCTURAL_NESTING_DEPTH,
  STRUCTURAL_BLOCK_TYPES,
} from '../src/lib/blockContract.js'
import { createBlockDefaultData } from '../src/lib/blockDefaults.js'
import { blockInspectorSchemas } from '../src/lib/blockInspectorSchema.js'
import { BLOCK_MIGRATION_STEPS } from '../src/lib/blockMigrations.js'
import { MAX_ROW_COLUMN_WIDTH as ROW_LAYOUT_MAX_COLUMN_WIDTH, ROW_LAYOUT_PRESETS } from '../src/lib/blockRowLayout.js'

const require = createRequire(import.meta.url)
const generatedServerContract = require('../functions/src/generated/blockContract.json')
const serverContract = require('../functions/src/blockContract.js')
const serverMigrations = require('../functions/src/blockMigrations.js')
const serverSchema = require('../functions/src/blockPageSchema.js')

const sortedBlockTypes = [...BLOCK_TYPES].sort()
const sortedStructuralTypes = [...STRUCTURAL_BLOCK_TYPES].sort()

assert.deepEqual(generatedServerContract, sharedBlockContract, 'Generated Functions block contract must match the canonical shared source.')
assert.equal(BLOCK_PAGE_CONTENT_MODEL, sharedBlockContract.blockPageContentModel)
assert.equal(BLOCK_DEFINITION_VERSION, sharedBlockContract.currentBlockVersion)
assert.deepEqual(BLOCK_CONTENT_SCHEMAS, sharedBlockContract.blockContentSchemas)
assert.deepEqual(BLOCK_ELEMENT_STYLE_TARGETS, sharedBlockContract.blockElementStyleTargets)
assert.deepEqual(BLOCK_TYPES, sharedBlockContract.supportedBlockTypes)
assert.deepEqual(BLOCK_VERSIONS, sharedBlockContract.blockVersions)
assert.deepEqual(BLOCK_STYLE_OPTIONS, sharedBlockContract.blockStyleOptions)
assert.deepEqual(BLOCK_RESPONSIVE_OPTIONS, sharedBlockContract.blockResponsiveOptions)
assert.deepEqual(STRUCTURAL_BLOCK_TYPES, sharedBlockContract.structuralBlockTypes)
assert.equal(MAX_STRUCTURAL_NESTING_DEPTH, sharedBlockContract.maxStructuralNestingDepth)
assert.equal(MAX_ROW_COLUMNS, sharedBlockContract.maxRowColumns)
assert.equal(MAX_ROW_COLUMN_WIDTH, sharedBlockContract.maxRowColumnWidth)

assert.equal(serverContract.BLOCK_PAGE_CONTENT_MODEL, BLOCK_PAGE_CONTENT_MODEL)
assert.deepEqual(serverContract.BLOCK_CONTENT_SCHEMAS, BLOCK_CONTENT_SCHEMAS)
assert.equal(serverContract.BLOCK_DEFINITION_VERSION, BLOCK_DEFINITION_VERSION)
assert.deepEqual(serverContract.BLOCK_ELEMENT_STYLE_TARGETS, BLOCK_ELEMENT_STYLE_TARGETS)
assert.deepEqual(serverContract.BLOCK_TYPES, BLOCK_TYPES)
assert.deepEqual(serverContract.BLOCK_VERSIONS, BLOCK_VERSIONS)
assert.deepEqual(serverContract.BLOCK_STYLE_OPTIONS, BLOCK_STYLE_OPTIONS)
assert.deepEqual(serverContract.BLOCK_RESPONSIVE_OPTIONS, BLOCK_RESPONSIVE_OPTIONS)
assert.deepEqual(serverContract.STRUCTURAL_BLOCK_TYPES, STRUCTURAL_BLOCK_TYPES)
assert.equal(serverContract.MAX_STRUCTURAL_NESTING_DEPTH, MAX_STRUCTURAL_NESTING_DEPTH)
assert.equal(serverContract.MAX_ROW_COLUMNS, MAX_ROW_COLUMNS)
assert.equal(serverContract.MAX_ROW_COLUMN_WIDTH, MAX_ROW_COLUMN_WIDTH)

assert.deepEqual([...serverSchema.SUPPORTED_BLOCK_TYPES].sort(), sortedBlockTypes)
assert.deepEqual([...serverSchema.STRUCTURAL_BLOCK_TYPES].sort(), sortedStructuralTypes)
assert.equal(serverSchema.MAX_STRUCTURAL_NESTING_DEPTH, MAX_STRUCTURAL_NESTING_DEPTH)
assert.equal(serverSchema.MAX_ROW_COLUMNS, MAX_ROW_COLUMNS)
assert.equal(serverSchema.MAX_ROW_COLUMN_WIDTH, MAX_ROW_COLUMN_WIDTH)
assert.equal(serverMigrations.CURRENT_BLOCK_VERSION, BLOCK_DEFINITION_VERSION)
assert.deepEqual([...serverMigrations.SUPPORTED_BLOCK_TYPES].sort(), sortedBlockTypes)

assert.deepEqual(Object.keys(blockInspectorSchemas).sort(), sortedBlockTypes, 'Inspector schemas must exactly match the shared block types.')
assert.deepEqual(Object.keys(BLOCK_ELEMENT_STYLE_TARGETS).sort(), sortedBlockTypes, 'Element style targets must exactly match the shared block types.')
assert.deepEqual(Object.keys(BLOCK_MIGRATION_STEPS).sort(), sortedBlockTypes, 'Client migrations must exactly match the shared block types.')
assert.deepEqual(Object.keys(serverMigrations.BLOCK_MIGRATION_STEPS).sort(), sortedBlockTypes, 'Server migrations must exactly match the shared block types.')
assert.equal(ROW_LAYOUT_MAX_COLUMN_WIDTH, MAX_ROW_COLUMN_WIDTH)
assert.ok(ROW_LAYOUT_PRESETS.every((preset) => preset.widths.length <= MAX_ROW_COLUMNS))

BLOCK_TYPES.forEach((type) => {
  assert.ok(createBlockDefaultData(type), `${type} must provide default data.`)
  assert.ok(Array.isArray(BLOCK_ELEMENT_STYLE_TARGETS[type]), `${type} must provide element style targets.`)
  assert.equal(getBlockDefinitionVersion(type), BLOCK_VERSIONS[type])
  assert.equal(serverContract.getBlockDefinitionVersion(type), BLOCK_VERSIONS[type])
})

assert.equal(new Set(BLOCK_TYPES).size, BLOCK_TYPES.length)
assert.ok(STRUCTURAL_BLOCK_TYPES.every((type) => BLOCK_TYPES.includes(type)))
assert.ok(Object.isFrozen(BLOCK_TYPES))
assert.ok(Object.isFrozen(STRUCTURAL_BLOCK_TYPES))

console.log(`Shared block contract tests passed for ${BLOCK_TYPES.length} block types.`)
