import { useState } from 'react'
import { buildRemoteImageUrl } from '../lib/remoteImage'
import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'
import { AdminMediaManager } from './AdminMediaManager'

const IMAGE_CONTEXT_PATTERN = /(image|photo|gallery|hero|logo|thumbnail|icon|picture)/i

function isImageSourceField(fieldKey, path = []) {
  const normalizedFieldKey = String(fieldKey ?? '')

  if (/(image|photo|gallery|logo|thumbnail|icon|picture)/i.test(normalizedFieldKey)) {
    return true
  }

  if (!/^(url|src)$/i.test(normalizedFieldKey)) {
    return false
  }

  return IMAGE_CONTEXT_PATTERN.test(path.slice(0, -1).join('.'))
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function makeSessionItemId() {
  return `doc-item-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createEmptyLike(template) {
  if (Array.isArray(template)) {
    return template.length > 0 ? [createEmptyLike(template[0])] : []
  }

  if (template && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, createEmptyLike(value)]))
  }

  if (typeof template === 'boolean') {
    return false
  }

  if (typeof template === 'number') {
    return 0
  }

  return ''
}

function getValueAtPath(root, path = []) {
  return path.reduce((current, segment) => (current == null ? current : current[segment]), root)
}

function isPrimitiveArrayShape(entry) {
  return entry.every((item) => item == null || ['string', 'number', 'boolean'].includes(typeof item))
}

function isAllStringsShape(entry) {
  return entry.every((item) => typeof item === 'string')
}

// `entry.every(...)` is vacuously true for an empty array, so an array field would get
// reclassified (object-array to plain string list, or numbers/booleans to strings) the
// moment an admin removes its last item - losing its shape the instant they add content
// back. When the live array is empty, fall back to how it looked in the document as it
// was first loaded (captured once, unaffected by edits made during this session)
// instead of guessing from nothing.
function classifyArray(entry, path, originalValue, classify, fallback) {
  if (entry.length > 0) {
    return classify(entry)
  }

  const originalEntry = getValueAtPath(originalValue, path)

  if (Array.isArray(originalEntry) && originalEntry.length > 0) {
    return classify(originalEntry)
  }

  return fallback
}

function updateValueAtPath(root, path, nextValue) {
  if (!path.length) {
    return nextValue
  }

  const nextRoot = cloneValue(root)
  let target = nextRoot

  for (let index = 0; index < path.length - 1; index += 1) {
    target = target[path[index]]
  }

  target[path[path.length - 1]] = nextValue
  return nextRoot
}

function removeArrayItemAtPath(root, path, indexToRemove) {
  const nextRoot = cloneValue(root)
  let target = nextRoot

  for (let index = 0; index < path.length; index += 1) {
    target = target[path[index]]
  }

  target.splice(indexToRemove, 1)
  return nextRoot
}

function addArrayItemAtPath(root, path, template) {
  const nextRoot = cloneValue(root)
  let target = nextRoot

  for (let index = 0; index < path.length; index += 1) {
    target = target[path[index]]
  }

  target.push(createEmptyLike(template))
  return nextRoot
}

function pathToString(path = []) {
  return path.join('.')
}

function humanizeKey(key = '', labelOverrides = {}) {
  if (labelOverrides[key]) {
    return labelOverrides[key]
  }

  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function shouldUseTextarea(fieldKey, value) {
  const text = String(value ?? '')

  return (
    text.includes('\n') ||
    text.length > 100 ||
    /(body|html|description|paragraph|message|note|lead|content|summary|copyright|credit|title)/i.test(fieldKey)
  )
}

function isLikelyImageUrl(fieldKey, path, value) {
  const text = String(value ?? '').trim()

  return Boolean(
    text &&
      /^https?:\/\//i.test(text) &&
      isImageSourceField(fieldKey, path),
  )
}

function isLikelyHtmlField(fieldKey, value) {
  const text = String(value ?? '').trim()

  return Boolean(text && (/<[a-z][\s\S]*>/i.test(text) || /html/i.test(fieldKey)))
}

function isLikelyLongCopyField(fieldKey, value) {
  const text = String(value ?? '').trim()

  return Boolean(
    text &&
      !isLikelyHtmlField(fieldKey, value) &&
      /(body|description|paragraph|message|note|lead|content|summary|copyright|credit|title)/i.test(fieldKey),
  )
}

function looksLikeImageAsset(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return typeof value.url === 'string' && Object.keys(value).every((key) => ['url', 'alt', 'title', 'width', 'height'].includes(key))
}

function shouldHidePath(path, hiddenKeySet, hiddenPathSet) {
  return hiddenKeySet.has(path[path.length - 1]) || hiddenPathSet.has(pathToString(path))
}

function resolveArrayCardLabel(entry, label, index) {
  return entry?.title || entry?.label || entry?.heading || entry?.name || `${label} ${index + 1}`
}

function DocumentPreview({ fieldKey, path, value }) {
  const text = String(value ?? '').trim()

  if (!text) {
    return null
  }

  if (isLikelyImageUrl(fieldKey, path, text)) {
    return (
      <div className="admin-document-preview admin-document-preview--image">
        <div className="admin-document-preview-label">Preview</div>
        <img alt="" loading="lazy" src={buildRemoteImageUrl(text, { width: 900, height: 540 })} />
      </div>
    )
  }

  if (isLikelyHtmlField(fieldKey, text)) {
    return (
      <div className="admin-document-preview admin-document-preview--copy">
        <div className="admin-document-preview-label">Preview</div>
        <div className="admin-preview-rich-copy" dangerouslySetInnerHTML={{ __html: normalizeSiteHtml(text) }} />
      </div>
    )
  }

  if (isLikelyLongCopyField(fieldKey, text)) {
    return (
      <div className="admin-document-preview admin-document-preview--copy">
        <div className="admin-document-preview-label">Preview</div>
        <div className="admin-preview-text-copy">
          {text.split(/\r?\n\s*\r?\n/).map((paragraph, index) => (
            <p key={`${path.join('.')}-${index}`}>{paragraph.trim()}</p>
          ))}
        </div>
      </div>
    )
  }

  return null
}

function ScalarField({ fieldKey, label, onChange, path, value, disabled }) {
  const inputId = `admin-document-${path.join('-') || 'root'}`

  if (typeof value === 'boolean') {
    return (
      <label className="admin-checkbox-field" htmlFor={inputId}>
        <input id={inputId} type="checkbox" checked={value} onChange={(event) => onChange(path, event.target.checked)} disabled={disabled} />
        <span>{label}</span>
      </label>
    )
  }

  const useTextarea = typeof value === 'string' && shouldUseTextarea(fieldKey, value)
  const showMediaLibrary = typeof value === 'string' && isImageSourceField(fieldKey, path)

  return (
    <div className="admin-field">
      {showMediaLibrary ? (
        <AdminMediaManager
          currentUrl={value ?? ''}
          disabled={disabled}
          onClear={() => onChange(path, '')}
          onSelect={(nextUrl) => onChange(path, nextUrl)}
          preferredOwnerType="page"
          title={`${label} Media`}
        />
      ) : null}
      <label htmlFor={inputId}>
        <span>{showMediaLibrary ? `Manual ${label}` : label}</span>
      </label>
      {useTextarea ? (
        <textarea id={inputId} rows="4" value={value ?? ''} onChange={(event) => onChange(path, event.target.value)} disabled={disabled} />
      ) : (
        <input
          id={inputId}
          type={typeof value === 'number' ? 'number' : 'text'}
          value={value ?? ''}
          onChange={(event) => {
            if (typeof value !== 'number') {
              onChange(path, event.target.value)
              return
            }

            // A number input reports "" for any not-yet-complete value (a lone "-",
            // a trailing decimal point, ...), not just for a genuinely cleared field.
            // Coercing that straight to 0 on every keystroke made it impossible to type
            // a negative number or a decimal one digit at a time. Skip the update while
            // incomplete and let onBlur below settle a truly-empty field back to 0.
            const rawValue = event.target.value

            if (rawValue === '') {
              return
            }

            const parsedValue = Number(rawValue)

            if (!Number.isFinite(parsedValue)) {
              return
            }

            onChange(path, parsedValue)
          }}
          onBlur={(event) => {
            if (typeof value === 'number' && event.target.value === '') {
              onChange(path, 0)
            }
          }}
          disabled={disabled}
        />
      )}
      {typeof value === 'string' ? <DocumentPreview fieldKey={fieldKey} path={path} value={value} /> : null}
    </div>
  )
}

function StringListField({ label, onChange, path, value, disabled }) {
  return (
    <label className="admin-field admin-field--wide">
      <span>{label}</span>
      <textarea
        rows="5"
        value={value.map((entry) => String(entry ?? '')).join('\n')}
        onChange={(event) =>
          onChange(
            path,
            event.target.value
              .split(/\r?\n/)
              .map((entry) => entry.trim())
              .filter(Boolean),
          )
        }
        disabled={disabled}
      />
    </label>
  )
}

function PrimitiveArrayEditor({
  fieldKey,
  label,
  onAddItem,
  onChange,
  onRemoveItem,
  originalValue,
  path,
  value,
  disabled,
  allowStructureChanges,
}) {
  // Session-local identity for each row so removing an earlier item doesn't shift a
  // later, currently-focused item's key and drop the cursor out from under the admin.
  // Kept as local UI state only (never written into the document) since this array has
  // no natural id field and this editor works over arbitrary, unknown document shapes
  // where adding a sibling field risks colliding with real content.
  const [itemIds, setItemIds] = useState(() => value.map(() => makeSessionItemId()))
  const allStrings = classifyArray(value, path, originalValue, isAllStringsShape, true)

  if (allStrings) {
    return <StringListField label={label} onChange={onChange} path={path} value={value} disabled={disabled} />
  }

  const sample = value[0] ?? ''

  function handleAddItem() {
    setItemIds((current) => [...current, makeSessionItemId()])
    onAddItem(path, sample)
  }

  function handleRemoveItem(index) {
    setItemIds((current) => current.filter((_, itemIndex) => itemIndex !== index))
    onRemoveItem(path, index)
  }

  return (
    <section className="admin-document-section">
      <div className="admin-document-header">
        <h4>{label}</h4>
        {allowStructureChanges ? (
          <button className="button-link button-link--ghost admin-action" type="button" onClick={handleAddItem} disabled={disabled}>
            Add item
          </button>
        ) : null}
      </div>

      <div className="admin-document-array">
        {value.length === 0 ? <p className="admin-note">No content in this section yet.</p> : null}

        {value.map((entry, index) => (
          <div className="admin-document-array-item" key={itemIds[index] ?? `${path.join('-')}-${index}`}>
            <ScalarField
              fieldKey={fieldKey}
              label={`${label} ${index + 1}`}
              onChange={onChange}
              path={[...path, index]}
              value={entry}
              disabled={disabled}
            />
            {allowStructureChanges ? (
              <button className="button-link button-link--ghost admin-action" type="button" onClick={() => handleRemoveItem(index)} disabled={disabled}>
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function ObjectArrayEditor({
  disabled,
  hiddenKeySet,
  hiddenPathSet,
  label,
  labelOverrides,
  onAddItem,
  onRemoveItem,
  path,
  allowStructureChanges,
  renderNode,
  value,
}) {
  const sample = value[0] ?? {}

  return (
    <section className="admin-document-section">
      <div className="admin-document-header">
        <h4>{label}</h4>
        {allowStructureChanges ? (
          <button className="button-link button-link--ghost admin-action" type="button" onClick={() => onAddItem(path, sample)} disabled={disabled}>
            Add item
          </button>
        ) : null}
      </div>

      <div className="admin-document-array">
        {value.length === 0 ? <p className="admin-note">No content in this section yet.</p> : null}

        {value.map((entry, index) => (
          <div
            className="admin-document-object-card"
            key={typeof entry?.id === 'string' && entry.id.trim() ? entry.id : `${path.join('-')}-${index}`}
          >
            <div className="admin-document-header">
              <h4>{resolveArrayCardLabel(entry, label, index)}</h4>
              {allowStructureChanges ? (
                <button className="button-link button-link--ghost admin-action" type="button" onClick={() => onRemoveItem(path, index)} disabled={disabled}>
                  Remove
                </button>
              ) : null}
            </div>
            {renderNode(entry, [...path, index], resolveArrayCardLabel(entry, label, index), {
              allowStructureChanges,
              hiddenKeySet,
              hiddenPathSet,
              labelOverrides,
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

function ObjectEditor({
  disabled,
  hiddenKeySet,
  hiddenPathSet,
  labelOverrides,
  onAddItem,
  onChange,
  onRemoveItem,
  originalValue,
  path,
  allowStructureChanges,
  presentation,
  renderNode,
  value,
  root = false,
}) {
  const entries = Object.entries(value ?? {}).filter(([key]) => !shouldHidePath([...path, key], hiddenKeySet, hiddenPathSet))

  return (
    <div
      className={`admin-document-grid ${root ? 'admin-document-grid--root' : ''} ${
        presentation === 'content' ? 'admin-document-grid--content' : ''
      }`.trim()}
    >
      {entries.map(([key, entry]) => {
        const childPath = [...path, key]
        const childLabel = humanizeKey(key, labelOverrides)

        if (Array.isArray(entry)) {
          const primitiveArray = classifyArray(entry, childPath, originalValue, isPrimitiveArrayShape, true)

          return primitiveArray ? (
            <PrimitiveArrayEditor
              key={childPath.join('.')}
              fieldKey={key}
              label={childLabel}
              onAddItem={onAddItem}
              onChange={onChange}
              onRemoveItem={onRemoveItem}
              originalValue={originalValue}
              path={childPath}
              value={entry}
              disabled={disabled}
              allowStructureChanges={allowStructureChanges}
            />
          ) : (
            <ObjectArrayEditor
              allowStructureChanges={allowStructureChanges}
              key={childPath.join('.')}
              disabled={disabled}
              hiddenKeySet={hiddenKeySet}
              hiddenPathSet={hiddenPathSet}
              label={childLabel}
              labelOverrides={labelOverrides}
              onAddItem={onAddItem}
              onChange={onChange}
              onRemoveItem={onRemoveItem}
              path={childPath}
              renderNode={renderNode}
              value={entry}
            />
          )
        }

        if (entry && typeof entry === 'object') {
          return (
            <section
              className={`admin-document-section ${looksLikeImageAsset(entry) ? 'admin-document-section--media' : ''}`.trim()}
              key={childPath.join('.')}
            >
              <div className="admin-document-header">
                <h4>{childLabel}</h4>
              </div>
              {looksLikeImageAsset(entry) ? (
                <div className="admin-document-preview admin-document-preview--image">
                  <div className="admin-document-preview-label">Preview</div>
                  <img
                    alt={entry.alt || childLabel}
                    loading="lazy"
                    src={buildRemoteImageUrl(entry, { width: 900, height: 540 })}
                  />
                </div>
              ) : null}
              {renderNode(entry, childPath, childLabel, {
              hiddenKeySet,
              hiddenPathSet,
              labelOverrides,
              allowStructureChanges,
            })}
          </section>
        )
      }

        return (
          <ScalarField
            key={childPath.join('.')}
            fieldKey={key}
            label={childLabel}
            onChange={onChange}
            path={childPath}
            value={entry}
            disabled={disabled}
          />
        )
      })}
    </div>
  )
}

export function AdminDocumentEditor({
  value,
  onChange,
  disabled = false,
  hiddenKeys = [],
  hiddenPaths = [],
  labelOverrides = {},
  allowStructureChanges = true,
  presentation = 'schema',
}) {
  const hiddenKeySet = new Set(hiddenKeys)
  const hiddenPathSet = new Set(hiddenPaths)
  // Captured once on mount so an empty array can still be classified against how it
  // looked when this document was first opened - see classifyArray.
  const [originalValue] = useState(() => value)

  function handleChange(path, nextValue) {
    onChange((current) => updateValueAtPath(current, path, nextValue))
  }

  function handleRemoveArrayItem(path, index) {
    onChange((current) => removeArrayItemAtPath(current, path, index))
  }

  function handleAddArrayItem(path, template) {
    onChange((current) => addArrayItemAtPath(current, path, template))
  }

  function renderNode(node, path = [], label = '', options = {}) {
    const nextHiddenKeySet = options.hiddenKeySet ?? hiddenKeySet
    const nextHiddenPathSet = options.hiddenPathSet ?? hiddenPathSet
    const nextLabelOverrides = options.labelOverrides ?? labelOverrides
    const nextAllowStructureChanges = options.allowStructureChanges ?? allowStructureChanges

    if (Array.isArray(node)) {
      const primitiveArray = classifyArray(node, path, originalValue, isPrimitiveArrayShape, true)

      return primitiveArray ? (
        <PrimitiveArrayEditor
          fieldKey={label}
          label={label || 'Items'}
          onAddItem={handleAddArrayItem}
          onChange={handleChange}
          onRemoveItem={handleRemoveArrayItem}
          originalValue={originalValue}
          path={path}
          value={node}
          disabled={disabled}
          allowStructureChanges={nextAllowStructureChanges}
        />
      ) : (
        <ObjectArrayEditor
          allowStructureChanges={nextAllowStructureChanges}
          disabled={disabled}
          hiddenKeySet={nextHiddenKeySet}
          hiddenPathSet={nextHiddenPathSet}
          label={label || 'Items'}
          labelOverrides={nextLabelOverrides}
          onAddItem={handleAddArrayItem}
          onRemoveItem={handleRemoveArrayItem}
          path={path}
          renderNode={renderNode}
          value={node}
        />
      )
    }

    if (node && typeof node === 'object') {
      return (
        <ObjectEditor
          disabled={disabled}
          hiddenKeySet={nextHiddenKeySet}
          hiddenPathSet={nextHiddenPathSet}
          labelOverrides={nextLabelOverrides}
          allowStructureChanges={nextAllowStructureChanges}
          onAddItem={handleAddArrayItem}
          onChange={handleChange}
          onRemoveItem={handleRemoveArrayItem}
          originalValue={originalValue}
          path={path}
          presentation={presentation}
          renderNode={renderNode}
          value={node}
          root={path.length === 0}
        />
      )
    }

    return (
      <ScalarField
        fieldKey={label}
        label={label || 'Value'}
        onChange={handleChange}
        path={path}
        value={node}
        disabled={disabled}
      />
    )
  }

  if (!value || typeof value !== 'object') {
    return <p className="admin-note">This section has no editable content yet.</p>
  }

  return renderNode(value)
}
