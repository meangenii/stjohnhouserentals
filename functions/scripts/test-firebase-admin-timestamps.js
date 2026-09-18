const assert = require('node:assert/strict')
const { assertExpectedUpdatedAtMatches, toEpochMillis } = require('../src/firebaseAdmin')

const isoTimestamp = '2026-09-18T17:25:19.769Z'
const epochMillis = Date.parse(isoTimestamp)
const firestoreTimestamp = {
  seconds: Math.floor(epochMillis / 1000),
  nanoseconds: (epochMillis % 1000) * 1000000,
}

assert.equal(toEpochMillis(isoTimestamp), epochMillis)
assert.equal(toEpochMillis(String(epochMillis)), epochMillis)
assert.equal(toEpochMillis(firestoreTimestamp), epochMillis)

assert.doesNotThrow(() => {
  assertExpectedUpdatedAtMatches(firestoreTimestamp, isoTimestamp, () => new Error('conflict'))
})

assert.throws(
  () => {
    assertExpectedUpdatedAtMatches(firestoreTimestamp, '2026-09-18T17:25:20.769Z', () => new Error('conflict'))
  },
  {
    message: 'conflict',
  },
)

console.log('firebase admin timestamp contract passed')
