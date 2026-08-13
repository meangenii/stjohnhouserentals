import assert from 'node:assert/strict'
import { normalizeSiteHtml } from '../src/lib/normalizeSiteHtml.js'
import { getClipboardRichTextHtml, richTextValueToHtml } from '../src/lib/richTextValue.js'

function assertUnsafeHtmlRemoved(html) {
  assert.equal(/<script\b/i.test(html), false)
  assert.equal(/<iframe\b/i.test(html), false)
  assert.equal(/<form\b/i.test(html), false)
  assert.equal(/<input\b/i.test(html), false)
  assert.equal(/\son[a-z]+\s*=/i.test(html), false)
  assert.equal(/javascript:/i.test(html), false)
  assert.equal(/position\s*:/i.test(html), false)
  assert.equal(/data-unsafe/i.test(html), false)
}

const dirtyHtml = [
  '<div onclick="bad()">',
  '<p data-unsafe="true" style="color: red;">Safe ',
  '<a href="javascript:alert(1)" onclick="bad()">link</a> ',
  '<a href="https://example.com" target="_blank" onclick="bad()">site</a> ',
  '<span class="bad-class property-rate-line" style="font-size: 18pt; position: absolute; font-weight: 700; text-decoration-line: underline;">Styled</span>',
  '<script>alert(1)</script>',
  '<iframe src="https://example.com/embed"></iframe>',
  '<custom-element data-unsafe="true">Custom</custom-element>',
  '</p>',
  '<form><input name="email" /></form>',
  '</div>',
].join('')

const normalizedHtml = normalizeSiteHtml(dirtyHtml)

assertUnsafeHtmlRemoved(normalizedHtml)
assert.ok(normalizedHtml.includes('Safe link'))
assert.ok(normalizedHtml.includes('<a href="https://example.com" target="_blank" rel="noreferrer noopener">site</a>'))
assert.ok(normalizedHtml.includes('<span style="font-size: 18pt; font-weight: bold; text-decoration: underline;" class="property-rate-line">Styled</span>'))
assert.ok(normalizedHtml.includes('Custom'))

const rewrittenInternalLink = normalizeSiteHtml('<a href="https://www.stjohnhouserentals.com/car-rental-ferry-boat-info/">Car info</a>')
assert.equal(rewrittenInternalLink, '<a href="/car-barge-information">Car info</a>')

const alignedHtml = normalizeSiteHtml(
  '<p style="text-align: center; display: grid;">Centered</p><table><tbody><tr><td style="text-align: right; vertical-align: bottom; position: absolute;">Cell</td></tr></tbody></table>',
)
assert.equal(
  alignedHtml,
  '<p style="text-align: center;">Centered</p><table><tbody><tr><td style="text-align: right; vertical-align: bottom;">Cell</td></tr></tbody></table>',
)

const coloredHtml = normalizeSiteHtml(
  '<p><span style="color: var(--brand-navy);">Token</span> <span style="color: #37a5dd;">Hex</span> <span style="color: rgb(17, 17, 17);">RGB</span> <span style="color: red;">Named</span></p>',
)
assert.equal(
  coloredHtml,
  '<p><span style="color: var(--brand-navy);">Token</span> <span style="color: #37a5dd;">Hex</span> <span style="color: #111111;">RGB</span> <span>Named</span></p>',
)

const decodedEscapedHtml = normalizeSiteHtml('&lt;p onclick="bad()"&gt;Escaped&lt;/p&gt;')
assert.equal(decodedEscapedHtml, '<p>Escaped</p>')

const pastedHtml = getClipboardRichTextHtml({
  getData(type) {
    if (type === 'text/html') {
      return '<p>Paste <a href="javascript:bad()">bad</a><script>alert(1)</script></p>'
    }

    return ''
  },
})

assert.equal(pastedHtml, '<p>Paste bad</p>')
assertUnsafeHtmlRemoved(pastedHtml)

const plainTextHtml = richTextValueToHtml('5 < 6 & 7 > 3')
assert.equal(plainTextHtml, '5 &lt; 6 &amp; 7 &gt; 3')
assertUnsafeHtmlRemoved(plainTextHtml)

console.log('Rich text sanitizer tests passed.')
