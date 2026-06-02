import { buildRemoteImageUrl } from '../lib/remoteImage'
import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
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
  const fieldPath = `${path.join('.')} ${fieldKey}`.trim()

  return Boolean(
    text &&
      /^https?:\/\//i.test(text) &&
      /(image|photo|gallery|hero|logo|thumbnail|icon|picture|url|src)/i.test(fieldPath),
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

  return (
    <label className="admin-field">
      <span>{label}</span>
      {useTextarea ? (
        <textarea rows="4" value={value ?? ''} onChange={(event) => onChange(path, event.target.value)} disabled={disabled} />
      ) : (
        <input
          id={inputId}
          type={typeof value === 'number' ? 'number' : 'text'}
          value={value ?? ''}
          onChange={(event) =>
            onChange(path, typeof value === 'number' ? Number(event.target.value || 0) : event.target.value)
          }
          disabled={disabled}
        />
      )}
      {typeof value === 'string' ? <DocumentPreview fieldKey={fieldKey} path={path} value={value} /> : null}
    </label>
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
  path,
  value,
  disabled,
  allowStructureChanges,
}) {
  const allStrings = value.every((entry) => typeof entry === 'string')

  if (allStrings) {
    return <StringListField label={label} onChange={onChange} path={path} value={value} disabled={disabled} />
  }

  const sample = value[0] ?? ''

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
          <div className="admin-document-array-item" key={`${path.join('-')}-${index}`}>
            <ScalarField
              fieldKey={fieldKey}
              label={`${label} ${index + 1}`}
              onChange={onChange}
              path={[...path, index]}
              value={entry}
              disabled={disabled}
            />
            {allowStructureChanges ? (
              <button className="button-link button-link--ghost admin-action" type="button" onClick={() => onRemoveItem(path, index)} disabled={disabled}>
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
          <div className="admin-document-object-card" key={`${path.join('-')}-${index}`}>
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
          const primitiveArray = entry.every(
            (item) => item == null || ['string', 'number', 'boolean'].includes(typeof item),
          )

          return primitiveArray ? (
            <PrimitiveArrayEditor
              key={childPath.join('.')}
              fieldKey={key}
              label={childLabel}
              onAddItem={onAddItem}
              onChange={onChange}
              onRemoveItem={onRemoveItem}
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
      const primitiveArray = node.every((item) => item == null || ['string', 'number', 'boolean'].includes(typeof item))

      return primitiveArray ? (
        <PrimitiveArrayEditor
          fieldKey={label}
          label={label || 'Items'}
          onAddItem={handleAddArrayItem}
          onChange={handleChange}
          onRemoveItem={handleRemoveArrayItem}
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
          allowStructureChanges={allowStructureChanges}
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
          allowStructureChanges={allowStructureChanges}
          onAddItem={handleAddArrayItem}
          onChange={handleChange}
          onRemoveItem={handleRemoveArrayItem}
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
