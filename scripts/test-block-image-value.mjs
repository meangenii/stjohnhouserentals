import assert from 'node:assert/strict'
import { clearBlockImageSource, getBlockImageAltText, selectManagedBlockImage } from '../src/lib/blockImageValue.js'

const selected = selectManagedBlockImage(
  {
    alt: 'Existing alt',
    assetId: 'old-asset',
    height: 200,
    kind: 'image',
    src: '/old-image.jpg',
    storagePath: 'old/path.jpg',
    title: 'Existing title',
    width: 300,
  },
  'https://firebasestorage.googleapis.com/v0/b/example/o/new.jpg',
  { alt: 'Library alt', height: 800, title: 'Library title', width: 1200 },
)

assert.equal(selected.url, 'https://firebasestorage.googleapis.com/v0/b/example/o/new.jpg')
assert.equal(selected.alt, 'Existing alt')
assert.equal(selected.title, 'Existing title')
assert.equal(selected.originalWidth, 1200)
assert.equal(selected.originalHeight, 800)
assert.equal(selected.width, null)
assert.equal(selected.height, null)
assert.equal('src' in selected, false)
assert.equal('assetId' in selected, false)
assert.equal('storagePath' in selected, false)

const selectedWithLibraryMetadata = selectManagedBlockImage({}, 'https://example.com/image.jpg', {
  alt: 'Library alt',
  height: '600',
  title: 'Library title',
  width: '900',
})
assert.equal(selectedWithLibraryMetadata.alt, 'Library alt')
assert.equal(selectedWithLibraryMetadata.title, 'Library title')
assert.equal(selectedWithLibraryMetadata.originalWidth, 900)
assert.equal(selectedWithLibraryMetadata.originalHeight, 600)

const cleared = clearBlockImageSource({ alt: 'Keep alt', id: 'gallery-item', kind: 'image', src: '/old.jpg', url: 'https://example.com/old.jpg' })
assert.equal(cleared.id, 'gallery-item')
assert.equal(cleared.alt, 'Keep alt')
assert.equal('src' in cleared, false)
assert.equal('url' in cleared, false)
assert.equal(getBlockImageAltText({ alt: 'Meaningful' }), 'Meaningful')
assert.equal(getBlockImageAltText({ alt: 'Ignored', decorative: true }), '')

console.log('Block image value tests passed.')
