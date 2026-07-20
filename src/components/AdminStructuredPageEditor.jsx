import { buildRemoteImageUrl } from '../lib/remoteImage'
import { getImageDimensions, normalizeImageDimension } from '../lib/imageSizePresets'
import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'
import { richTextLinesToHtml, richTextValueToInlineHtml, richTextValueToLines } from '../lib/richTextValue'
import { AdminRichTextEditor } from './AdminRichTextEditor'
import { AdminMediaManager } from './AdminMediaManager'
import { AdminImageSizeControls } from './AdminImageSizeControls'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function makeStructuredItemId() {
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getValueAtPath(root, path = []) {
  return path.reduce((currentValue, segment) => currentValue?.[segment], root)
}

function updateValueAtPath(root, path, nextValue) {
  if (!path.length) {
    return nextValue
  }

  const nextRoot = cloneValue(root)
  let target = nextRoot

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]
    const nextSegment = path[index + 1]

    if (target[segment] == null) {
      target[segment] = typeof nextSegment === 'number' ? [] : {}
    }

    target = target[segment]
  }

  target[path[path.length - 1]] = nextValue
  return nextRoot
}

function addArrayItemAtPath(root, path, nextItem) {
  const nextRoot = cloneValue(root)
  const target = getValueAtPath(nextRoot, path)

  if (!Array.isArray(target)) {
    return nextRoot
  }

  target.push(nextItem)
  return nextRoot
}

function removeArrayItemAtPath(root, path, indexToRemove) {
  const nextRoot = cloneValue(root)
  const target = getValueAtPath(nextRoot, path)

  if (!Array.isArray(target)) {
    return nextRoot
  }

  target.splice(indexToRemove, 1)
  return nextRoot
}

function moveArrayItemAtPath(root, path, currentIndex, offset) {
  const nextRoot = cloneValue(root)
  const target = getValueAtPath(nextRoot, path)

  if (!Array.isArray(target)) {
    return nextRoot
  }

  const nextIndex = currentIndex + offset

  if (nextIndex < 0 || nextIndex >= target.length) {
    return nextRoot
  }

  const [item] = target.splice(currentIndex, 1)
  target.splice(nextIndex, 0, item)
  return nextRoot
}

function parseLines(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function linesToText(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry ?? '')).join('\n') : ''
}

function normalizeRichInlineValue(value) {
  return richTextValueToInlineHtml(value).trim()
}

function normalizeRichInlineValues(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((entry) => normalizeRichInlineValue(entry))
    .filter(Boolean)
}

function parseRichLines(value) {
  return richTextValueToLines(value)
    .map((entry) => normalizeRichInlineValue(entry))
    .filter(Boolean)
}

const RICH_PARAGRAPH_BLOCK_TAGS = new Set(['BLOCKQUOTE', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'P'])

function parseRichParagraphs(value) {
  const normalizedHtml = normalizeSiteHtml(value ?? '').trim()

  if (!normalizedHtml) {
    return []
  }

  if (typeof DOMParser === 'undefined') {
    return normalizedHtml
      .split(/<\/(?:blockquote|div|h[1-6]|li|p)>/i)
      .map((entry) => normalizeRichInlineValue(entry))
      .filter(Boolean)
  }

  const documentNode = new DOMParser().parseFromString(`<div>${normalizedHtml}</div>`, 'text/html')
  const root = documentNode.body.firstElementChild

  if (!root) {
    return []
  }

  const paragraphs = []
  const addParagraph = (sourceValue) => {
    const normalizedParagraph = normalizeRichInlineValue(sourceValue)

    if (normalizedParagraph) {
      paragraphs.push(normalizedParagraph)
    }
  }

  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === 3) {
      addParagraph(node.textContent ?? '')
      return
    }

    if (node.nodeType !== 1) {
      return
    }

    const tagName = node.nodeName.toUpperCase()

    if (tagName === 'BR') {
      return
    }

    if (RICH_PARAGRAPH_BLOCK_TAGS.has(tagName)) {
      addParagraph(node.innerHTML)
      return
    }

    addParagraph(node.outerHTML ?? node.textContent ?? '')
  })

  return paragraphs
}

function resolveEditableImageSrc(image) {
  const directUrl = String(image?.url ?? '').trim()

  if (directUrl) {
    const { width, height } = getImageDimensions(image, { width: 1200, height: 720 })

    return buildRemoteImageUrl(directUrl, { width, height }) || directUrl
  }

  return ''
}

function Field({ children, wide = false }) {
  return <div className={`admin-field${wide ? ' admin-field--wide' : ''}`.trim()}>{children}</div>
}

function TextField({ label, value, onChange, disabled, placeholder = '', type = 'text', wide = false }) {
  return (
    <label className={`admin-field${wide ? ' admin-field--wide' : ''}`.trim()}>
      <span>{label}</span>
      <input disabled={disabled} placeholder={placeholder} type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function CheckboxField({ label, checked, onChange, disabled }) {
  return (
    <label className="admin-checkbox-field">
      <input checked={checked} disabled={disabled} type="checkbox" onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function TextAreaField({ label, value, onChange, disabled, placeholder = '', rows = 5, wide = true }) {
  return (
    <label className={`admin-field${wide ? ' admin-field--wide' : ''}`.trim()}>
      <span>{label}</span>
      <textarea
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function RichTextField({
  collapsedFontSizeBehavior = 'block',
  disabled,
  helperText = '',
  label,
  onChange,
  placeholder = '',
  value,
  wide = true,
}) {
  return (
    <div className={`admin-field admin-field--rich${wide ? ' admin-field--wide' : ''}`.trim()}>
      <AdminRichTextEditor
        collapsedFontSizeBehavior={collapsedFontSizeBehavior}
        compact
        contentMode="inline"
        disabled={disabled}
        helperText={helperText}
        label={label}
        onChange={(nextValue) => onChange(normalizeRichInlineValue(nextValue))}
        placeholder={placeholder}
        value={value ?? ''}
      />
    </div>
  )
}

function LinesField({ label, value, onChange, disabled, placeholder = '', rows = 5, wide = true }) {
  return (
    <label className={`admin-field${wide ? ' admin-field--wide' : ''}`.trim()}>
      <span>{label}</span>
      <textarea
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        value={linesToText(value)}
        onChange={(event) => onChange(parseLines(event.target.value))}
      />
    </label>
  )
}

function RichLinesField({
  collapsedFontSizeBehavior = 'block',
  disabled,
  helperText = '',
  label,
  onChange,
  placeholder = '',
  value,
  wide = true,
}) {
  return (
    <div className={`admin-field admin-field--rich${wide ? ' admin-field--wide' : ''}`.trim()}>
      <AdminRichTextEditor
        collapsedFontSizeBehavior={collapsedFontSizeBehavior}
        compact
        contentMode="lines"
        disabled={disabled}
        helperText={helperText}
        label={label}
        onChange={(nextValue) => onChange(parseRichLines(nextValue))}
        placeholder={placeholder}
        value={richTextLinesToHtml(normalizeRichInlineValues(value))}
      />
    </div>
  )
}

function RichParagraphsField({
  collapsedFontSizeBehavior = 'block',
  disabled,
  helperText = '',
  label,
  onChange,
  placeholder = '',
  value,
  wide = true,
}) {
  return (
    <div className={`admin-field admin-field--rich${wide ? ' admin-field--wide' : ''}`.trim()}>
      <AdminRichTextEditor
        collapsedFontSizeBehavior={collapsedFontSizeBehavior}
        compact
        contentMode="paragraphs"
        disabled={disabled}
        helperText={helperText}
        label={label}
        onChange={(nextValue) => onChange(parseRichParagraphs(nextValue))}
        placeholder={placeholder}
        value={richTextLinesToHtml(normalizeRichInlineValues(value))}
      />
    </div>
  )
}

function HtmlField({ label, value, onChange, disabled }) {
  const normalizedHtml = normalizeSiteHtml(value ?? '').trim()

  return (
    <div className="admin-content-html-field">
      <AdminRichTextEditor allowSourceMode contentMode="block" disabled={disabled} label={label} onChange={onChange} value={value ?? ''} />

      {normalizedHtml ? (
        <div className="admin-document-preview admin-document-preview--copy">
          <div className="admin-document-preview-label">Preview</div>
          <div className="admin-preview-rich-copy" dangerouslySetInnerHTML={{ __html: normalizedHtml }} />
        </div>
      ) : null}
    </div>
  )
}

function LinkFields({
  label,
  link,
  disabled,
  onHrefChange,
  onLabelChange,
  hrefLabel = 'Link URL',
  textLabel = 'Link Text',
}) {
  const linkTarget = link?.href ?? link?.path ?? ''

  return (
    <div className="admin-content-grid">
      <TextField disabled={disabled} label={`${label} ${textLabel}`} onChange={onLabelChange} value={link?.label ?? ''} />
      <TextField disabled={disabled} label={`${label} ${hrefLabel}`} onChange={onHrefChange} value={linkTarget} />
    </div>
  )
}

function mergeImageFallback(fallbackImage, image) {
  if (!image) {
    return fallbackImage
  }

  return {
    ...fallbackImage,
    ...image,
  }
}

function ImageField({ hideLabel = false, label, image, disabled, onChange }) {
  const previewSrc = resolveEditableImageSrc(image)

  function handleSizeChange(nextSize) {
    onChange('kind', image?.kind ?? 'image')
    onChange('url', image?.url ?? '')
    onChange('alt', image?.alt ?? '')
    onChange('title', image?.title ?? '')
    onChange('width', nextSize.width)
    onChange('height', nextSize.height)

    if (Object.prototype.hasOwnProperty.call(nextSize, 'originalWidth')) {
      onChange('originalWidth', nextSize.originalWidth)
    }

    if (Object.prototype.hasOwnProperty.call(nextSize, 'originalHeight')) {
      onChange('originalHeight', nextSize.originalHeight)
    }
  }

  function handleSelectImage(nextUrl, entry) {
    const originalWidth = normalizeImageDimension(entry?.width)
    const originalHeight = normalizeImageDimension(entry?.height)

    onChange('kind', image?.kind ?? 'image')
    onChange('url', nextUrl)
    onChange('originalWidth', originalWidth || null)
    onChange('originalHeight', originalHeight || null)

    if (!image?.alt && entry?.alt) {
      onChange('alt', entry.alt)
    }

    if (!image?.title && entry?.title) {
      onChange('title', entry.title)
    }
  }

  return (
    <section className="admin-content-media-field">
      {hideLabel ? null : (
        <div className="admin-content-media-header">
          <h5>{label}</h5>
        </div>
      )}

      <AdminMediaManager
        currentUrl={image?.url ?? ''}
        disabled={disabled}
        onClear={() => onChange('url', '')}
        onSelect={handleSelectImage}
        preferredOwnerType="page"
        title=""
      />

      <div className="admin-content-grid">
        <TextField disabled={disabled} label="Manual Image URL" onChange={(value) => onChange('url', value)} value={image?.url ?? ''} wide />
        <TextField disabled={disabled} label="Alt Text" onChange={(value) => onChange('alt', value)} value={image?.alt ?? ''} />
        <TextField disabled={disabled} label="Image Title" onChange={(value) => onChange('title', value)} value={image?.title ?? ''} />
      </div>

      <AdminImageSizeControls disabled={disabled} image={image} onChange={handleSizeChange} />

      {previewSrc ? (
        <div className="admin-content-image-preview">
          <img alt={image?.alt || ''} loading="lazy" src={previewSrc} />
        </div>
      ) : null}
    </section>
  )
}

function SectionCard({ title, description, children }) {
  return (
    <section className="admin-content-section">
      <div className="admin-content-section-header">
        <div>
          <h4>{title}</h4>
          {description ? <p>{description}</p> : null}
        </div>
      </div>

      <div className="admin-content-grid">{children}</div>
    </section>
  )
}

function ItemCard({ title, children, onMoveUp, onMoveDown, onRemove, disabled, canMoveUp, canMoveDown }) {
  return (
    <article className="admin-content-item-card">
      <div className="admin-content-item-header">
        <h5>{title}</h5>
        <div className="admin-content-item-actions">
          <button className="button-link button-link--ghost admin-action" type="button" onClick={onMoveUp} disabled={disabled || !canMoveUp}>
            Move Up
          </button>
          <button className="button-link button-link--ghost admin-action" type="button" onClick={onMoveDown} disabled={disabled || !canMoveDown}>
            Move Down
          </button>
          {onRemove ? (
            <button className="button-link button-link--ghost admin-action" type="button" onClick={onRemove} disabled={disabled}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-content-grid">{children}</div>
    </article>
  )
}

function RepeatingSection({
  title,
  description,
  items,
  itemLabel,
  addLabel,
  onAdd,
  disabled,
  renderItem,
}) {
  return (
    <section className="admin-content-repeating-section">
      <div className="admin-content-section-header">
        <div>
          <h5>{title}</h5>
          {description ? <p>{description}</p> : null}
        </div>
        {onAdd ? (
          <button className="button-link button-link--ghost admin-action" type="button" onClick={onAdd} disabled={disabled}>
            {addLabel || `Add ${itemLabel}`}
          </button>
        ) : null}
      </div>

      <div className="admin-content-list">
        {items.length ? items.map((item, index) => renderItem(item, index)) : <p className="admin-note">No {itemLabel}s yet.</p>}
      </div>
    </section>
  )
}

function renderHomeEditor(page, helpers) {
  const { disabled, moveItem, setPath } = helpers

  return (
    <>
      <SectionCard description="This is the first banner visitors see on the homepage." title="Hero Banner">
        <RichLinesField
          disabled={disabled}
          label="Heading Lines"
          onChange={(value) => setPath(['hero', 'titleLines'], value)}
          value={page.hero?.titleLines ?? []}
        />
        <RichTextField disabled={disabled} label="Lead Text" onChange={(value) => setPath(['hero', 'lead'], value)} value={page.hero?.lead ?? ''} />
        <Field wide>
          <ImageField
            disabled={disabled}
            image={page.hero?.image}
            label="Hero Image"
            onChange={(field, value) => setPath(['hero', 'image', field], value)}
          />
        </Field>
      </SectionCard>

      <SectionCard description="This headline sits above the bedroom directory on the homepage." title="Rental Directory Intro">
        <RichTextField
          disabled={disabled}
          label="Section Heading"
          onChange={(value) => setPath(['directory', 'title'], value)}
          value={page.directory?.title ?? ''}
        />
      </SectionCard>

      <SectionCard description="This section explains why visitors should book through the site." title="Why Choose Us">
        <TextField disabled={disabled} label="Small Heading" onChange={(value) => setPath(['trust', 'eyebrow'], value)} value={page.trust?.eyebrow ?? ''} />
        <RichTextField disabled={disabled} label="Main Heading" onChange={(value) => setPath(['trust', 'title'], value)} value={page.trust?.title ?? ''} />
        <RichTextField disabled={disabled} label="Supporting Text" onChange={(value) => setPath(['trust', 'lead'], value)} value={page.trust?.lead ?? ''} />
        <Field wide>
          <LinkFields
            disabled={disabled}
            label="Button"
            link={page.trust?.action}
            onHrefChange={(value) => setPath(['trust', 'action', 'path'], value)}
            onLabelChange={(value) => setPath(['trust', 'action', 'label'], value)}
          />
        </Field>
        <Field wide>
          <ImageField
            disabled={disabled}
            image={page.trust?.image}
            label="Section Image"
            onChange={(field, value) => setPath(['trust', 'image', field], value)}
          />
        </Field>
      </SectionCard>

      <SectionCard description="These cards sit beside the homepage collage image." title="Discover Section">
        <RichTextField disabled={disabled} label="Section Heading" onChange={(value) => setPath(['discover', 'title'], value)} value={page.discover?.title ?? ''} />
        <Field wide>
          <ImageField
            disabled={disabled}
            image={page.discover?.image}
            label="Collage Image"
            onChange={(field, value) => setPath(['discover', 'image', field], value)}
          />
        </Field>
        <Field wide>
          <RepeatingSection
            description="These four cards stay in place on the homepage."
            disabled={disabled}
            itemLabel="feature"
            items={page.discover?.features ?? []}
            renderItem={(feature, index) => (
              <ItemCard
                canMoveDown={index < (page.discover?.features?.length ?? 0) - 1}
                canMoveUp={index > 0}
                disabled={disabled}
                key={feature?.id ?? `discover-feature-${index}`}
                onMoveDown={() => moveItem(['discover', 'features'], index, 1)}
                onMoveUp={() => moveItem(['discover', 'features'], index, -1)}
                title={feature?.title || `Feature ${index + 1}`}
              >
                <TextField
                  disabled={disabled}
                  label="Card Title"
                  onChange={(value) => setPath(['discover', 'features', index, 'title'], value)}
                  value={feature?.title ?? ''}
                />
                <RichTextField
                  disabled={disabled}
                  label="Card Description"
                  onChange={(value) => setPath(['discover', 'features', index, 'body'], value)}
                  value={feature?.body ?? ''}
                />
              </ItemCard>
            )}
            title="Feature Cards"
          />
        </Field>
      </SectionCard>

      <SectionCard description="This block links the homepage to the broader brand story." title="About Section">
        <RichTextField disabled={disabled} label="Section Heading" onChange={(value) => setPath(['about', 'title'], value)} value={page.about?.title ?? ''} />
        <RichTextField disabled={disabled} label="Text Before Link" onChange={(value) => setPath(['about', 'bodyIntro'], value)} value={page.about?.bodyIntro ?? ''} />
        <RichTextField disabled={disabled} label="Text After Link" onChange={(value) => setPath(['about', 'bodyOutro'], value)} value={page.about?.bodyOutro ?? ''} />
        <Field wide>
          <LinkFields
            disabled={disabled}
            label="Inline Link"
            link={page.about?.bodyLink}
            onHrefChange={(value) => setPath(['about', 'bodyLink', 'href'], value)}
            onLabelChange={(value) => setPath(['about', 'bodyLink', 'label'], value)}
          />
        </Field>
        <Field wide>
          <ImageField
            disabled={disabled}
            image={page.about?.image}
            label="Section Image"
            onChange={(field, value) => setPath(['about', 'image', field], value)}
          />
        </Field>
      </SectionCard>
    </>
  )
}

function renderAboutPageEditor(page, helpers) {
  const { disabled, setPath } = helpers

  return (
    <>
      <SectionCard description="This image and headline lead the About page." title="Hero Banner">
        <RichTextField disabled={disabled} label="Heading" onChange={(value) => setPath(['hero', 'title'], value)} value={page.hero?.title ?? ''} />
        <Field wide>
          <ImageField
            disabled={disabled}
            image={page.hero?.image}
            label="Hero Image"
            onChange={(field, value) => setPath(['hero', 'image', field], value)}
          />
        </Field>
      </SectionCard>

      <SectionCard description="This is the main story block on the About page." title="Story Section">
        <TextField disabled={disabled} label="Small Heading" onChange={(value) => setPath(['story', 'kicker'], value)} value={page.story?.kicker ?? ''} />
        <RichTextField disabled={disabled} label="Main Heading" onChange={(value) => setPath(['story', 'title'], value)} value={page.story?.title ?? ''} />
        <RichParagraphsField
          disabled={disabled}
          label="Intro Paragraphs"
          onChange={(value) => setPath(['story', 'leadParagraphs'], value)}
          value={page.story?.leadParagraphs ?? []}
        />
        <RichParagraphsField
          disabled={disabled}
          label="Story Body Paragraphs"
          onChange={(value) => setPath(['story', 'bodyParagraphs'], value)}
          value={page.story?.bodyParagraphs ?? []}
        />
        <Field wide>
          <ImageField
            disabled={disabled}
            image={page.story?.image}
            label="Story Image"
            onChange={(field, value) => setPath(['story', 'image', field], value)}
          />
        </Field>
      </SectionCard>

      <SectionCard description="This finishes the About page with a second content block." title="Essentials Section">
        <TextField disabled={disabled} label="Small Heading" onChange={(value) => setPath(['essentials', 'kicker'], value)} value={page.essentials?.kicker ?? ''} />
        <RichTextField disabled={disabled} label="Main Heading" onChange={(value) => setPath(['essentials', 'title'], value)} value={page.essentials?.title ?? ''} />
        <RichTextField disabled={disabled} label="Lead Paragraph" onChange={(value) => setPath(['essentials', 'lead'], value)} value={page.essentials?.lead ?? ''} />
        <Field wide>
          <ImageField
            disabled={disabled}
            image={page.essentials?.image}
            label="Section Image"
            onChange={(field, value) => setPath(['essentials', 'image', field], value)}
          />
        </Field>
      </SectionCard>
    </>
  )
}

function renderHouseRentalsEditor(page, helpers) {
  const { disabled, setPath } = helpers

  return (
    <>
      <SectionCard description="This opening copy introduces the private rental directory." title="Intro Section">
        <TextField disabled={disabled} label="Small Heading" onChange={(value) => setPath(['intro', 'eyebrow'], value)} value={page.intro?.eyebrow ?? ''} />
        <RichTextField disabled={disabled} label="Main Heading" onChange={(value) => setPath(['intro', 'title'], value)} value={page.intro?.title ?? ''} />
        <RichTextField disabled={disabled} label="Lead Paragraph" onChange={(value) => setPath(['intro', 'lead'], value)} value={page.intro?.lead ?? ''} />
        <RichParagraphsField disabled={disabled} label="Body Paragraphs" onChange={(value) => setPath(['intro', 'paragraphs'], value)} value={page.intro?.paragraphs ?? []} />
      </SectionCard>

      <SectionCard description="These labels sit above the live property directory." title="Property Directory">
        <RichTextField disabled={disabled} label="Section Heading" onChange={(value) => setPath(['directory', 'title'], value)} value={page.directory?.title ?? ''} />
        <TextField disabled={disabled} label="Property Button Text" onChange={(value) => setPath(['directory', 'actionLabel'], value)} value={page.directory?.actionLabel ?? ''} />
      </SectionCard>
    </>
  )
}

function renderAdvertiseEditor(page, helpers) {
  const { disabled, setPath } = helpers
  const fields = Array.isArray(page.form?.fields) ? page.form.fields : []

  return (
    <>
      <SectionCard description="This is the top image and heading on the Advertise page." title="Hero Banner">
        <RichTextField disabled={disabled} label="Heading" onChange={(value) => setPath(['hero', 'title'], value)} value={page.hero?.title ?? ''} />
        <Field wide>
          <ImageField disabled={disabled} image={page.hero?.image} label="Hero Image" onChange={(field, value) => setPath(['hero', 'image', field], value)} />
        </Field>
      </SectionCard>

      <SectionCard description="This text explains how advertising works and where inquiries should go." title="Page Copy">
        <RichTextField disabled={disabled} label="Section Heading" onChange={(value) => setPath(['contact', 'title'], value)} value={page.contact?.title ?? ''} />
        <TextField disabled={disabled} label="Subheading" onChange={(value) => setPath(['contact', 'subtitle'], value)} value={page.contact?.subtitle ?? ''} />
        <RichParagraphsField disabled={disabled} label="Body Paragraphs" onChange={(value) => setPath(['contact', 'bodyParagraphs'], value)} value={page.contact?.bodyParagraphs ?? []} />
        <RichTextField disabled={disabled} label="Booking Notice" onChange={(value) => setPath(['contact', 'bookingNotice'], value)} value={page.contact?.bookingNotice ?? ''} />
        <RichTextField disabled={disabled} label="Booking Help Before Bold Text" onChange={(value) => setPath(['contact', 'bookingHelpParts', 'before'], value)} value={page.contact?.bookingHelpParts?.before ?? ''} />
        <TextField disabled={disabled} label="Booking Help Bold Text" onChange={(value) => setPath(['contact', 'bookingHelpParts', 'emphasis'], value)} value={page.contact?.bookingHelpParts?.emphasis ?? ''} />
        <RichTextField disabled={disabled} label="Booking Help After Bold Text" onChange={(value) => setPath(['contact', 'bookingHelpParts', 'after'], value)} value={page.contact?.bookingHelpParts?.after ?? ''} />
        <TextField disabled={disabled} label="Contact Details Heading" onChange={(value) => setPath(['contact', 'contactTitle'], value)} value={page.contact?.contactTitle ?? ''} />

        <Field wide>
          <RepeatingSection
            addLabel="Add Contact Line"
            description="These lines show under the contact heading."
            disabled={disabled}
            itemLabel="contact line"
            items={page.contact?.contactLines ?? []}
            onAdd={() => helpers.addItem(['contact', 'contactLines'], { label: '', value: '', href: '' })}
            renderItem={(line, index) => (
              <ItemCard
                canMoveDown={index < (page.contact?.contactLines?.length ?? 0) - 1}
                canMoveUp={index > 0}
                disabled={disabled}
                key={line?.id ?? `contact-line-${index}`}
                onMoveDown={() => helpers.moveItem(['contact', 'contactLines'], index, 1)}
                onMoveUp={() => helpers.moveItem(['contact', 'contactLines'], index, -1)}
                onRemove={() => helpers.removeItem(['contact', 'contactLines'], index)}
                title={line?.label || `Contact Line ${index + 1}`}
              >
                <TextField disabled={disabled} label="Label" onChange={(value) => setPath(['contact', 'contactLines', index, 'label'], value)} value={line?.label ?? ''} />
                <TextField disabled={disabled} label="Visible Text" onChange={(value) => setPath(['contact', 'contactLines', index, 'value'], value)} value={line?.value ?? ''} />
                <TextField disabled={disabled} label="Link URL" onChange={(value) => setPath(['contact', 'contactLines', index, 'href'], value)} value={line?.href ?? ''} wide />
              </ItemCard>
            )}
            title="Contact Lines"
          />
        </Field>
      </SectionCard>

      <SectionCard description="These labels control the contact form visitors fill out on the page." title="Contact Form">
        <div className="admin-content-list">
          {fields.map((field, index) => (
            <ItemCard
              canMoveDown={false}
              canMoveUp={false}
              disabled={disabled}
              key={field.id || index}
              title={field.label || `Field ${index + 1}`}
            >
              <TextField disabled={disabled} label="Field Label" onChange={(value) => setPath(['form', 'fields', index, 'label'], value)} value={field?.label ?? ''} />
              <TextField
                disabled={disabled}
                label="Placeholder Text"
                onChange={(value) => setPath(['form', 'fields', index, 'placeholder'], value)}
                value={field?.placeholder ?? ''}
              />
            </ItemCard>
          ))}

          <ItemCard canMoveDown={false} canMoveUp={false} disabled={disabled} title="Message Field">
            <TextField
              disabled={disabled}
              label="Field Label"
              onChange={(value) => setPath(['form', 'messageField', 'label'], value)}
              value={page.form?.messageField?.label ?? ''}
            />
            <TextField
              disabled={disabled}
              label="Placeholder Text"
              onChange={(value) => setPath(['form', 'messageField', 'placeholder'], value)}
              value={page.form?.messageField?.placeholder ?? ''}
            />
          </ItemCard>
        </div>

        <TextField disabled={disabled} label="Submit Button Text" onChange={(value) => setPath(['form', 'submitLabel'], value)} value={page.form?.submitLabel ?? ''} wide />
      </SectionCard>
    </>
  )
}

function renderLocalAttractionsEditor(page, helpers) {
  const { disabled, setPath } = helpers
  const diningSections = Array.isArray(page.dining?.sections) ? page.dining.sections : []

  return (
    <>
      <SectionCard description="This is the opening image and copy for the Local Attractions page." title="Hero Banner">
        <RichTextField disabled={disabled} label="Heading" onChange={(value) => setPath(['hero', 'title'], value)} value={page.hero?.title ?? ''} />
        <RichTextField disabled={disabled} label="Tagline" onChange={(value) => setPath(['hero', 'tagline'], value)} value={page.hero?.tagline ?? ''} />
        <Field wide>
          <ImageField hideLabel disabled={disabled} image={page.hero?.image} label="Hero Image" onChange={(field, value) => setPath(['hero', 'image', field], value)} />
        </Field>
      </SectionCard>

      <SectionCard description="This section controls the map, button text, and introduction under it." title="Map And Intro">
        <Field wide>
          <ImageField disabled={disabled} image={page.map?.image} label="Map Image" onChange={(field, value) => setPath(['map', 'image', field], value)} />
        </Field>
        <Field wide>
          <LinkFields
            disabled={disabled}
            label="Map Button"
            link={page.map?.action}
            onHrefChange={(value) => setPath(['map', 'action', 'href'], value)}
            onLabelChange={(value) => setPath(['map', 'action', 'label'], value)}
            hrefLabel="Button Link"
            textLabel="Button Text"
          />
        </Field>
        <RichTextField disabled={disabled} label="Intro Heading" onChange={(value) => setPath(['intro', 'title'], value)} value={page.intro?.title ?? ''} />
        <RichParagraphsField disabled={disabled} label="Intro Paragraphs" onChange={(value) => setPath(['intro', 'paragraphs'], value)} value={page.intro?.paragraphs ?? []} />
      </SectionCard>

      <SectionCard description="These restaurant groups appear lower on the page." title="Dining Guide">
        <RichTextField disabled={disabled} label="Section Heading" onChange={(value) => setPath(['dining', 'title'], value)} value={page.dining?.title ?? ''} />

        <Field wide>
          <RepeatingSection
            addLabel="Add Dining Area"
            description="Add or update each dining area and its restaurant rows."
            disabled={disabled}
            itemLabel="dining area"
            items={diningSections}
            onAdd={() => helpers.addItem(['dining', 'sections'], { title: '', restaurants: [] })}
            renderItem={(section, sectionIndex) => (
              <ItemCard
                canMoveDown={sectionIndex < diningSections.length - 1}
                canMoveUp={sectionIndex > 0}
                disabled={disabled}
                key={section?.id ?? `dining-section-${sectionIndex}`}
                onMoveDown={() => helpers.moveItem(['dining', 'sections'], sectionIndex, 1)}
                onMoveUp={() => helpers.moveItem(['dining', 'sections'], sectionIndex, -1)}
                onRemove={() => helpers.removeItem(['dining', 'sections'], sectionIndex)}
                title={section?.title || `Dining Area ${sectionIndex + 1}`}
              >
                <TextField disabled={disabled} label="Area Heading" onChange={(value) => setPath(['dining', 'sections', sectionIndex, 'title'], value)} value={section?.title ?? ''} wide />

                <Field wide>
                  <RepeatingSection
                    addLabel="Add Restaurant"
                    disabled={disabled}
                    itemLabel="restaurant"
                    items={Array.isArray(section?.restaurants) ? section.restaurants : []}
                    onAdd={() => helpers.addItem(['dining', 'sections', sectionIndex, 'restaurants'], { name: '', cuisine: '', location: '', phone: '' })}
                    renderItem={(restaurant, restaurantIndex) => (
                      <ItemCard
                        canMoveDown={restaurantIndex < (section?.restaurants?.length ?? 0) - 1}
                        canMoveUp={restaurantIndex > 0}
                        disabled={disabled}
                        key={restaurant?.id ?? `restaurant-${sectionIndex}-${restaurantIndex}`}
                        onMoveDown={() => helpers.moveItem(['dining', 'sections', sectionIndex, 'restaurants'], restaurantIndex, 1)}
                        onMoveUp={() => helpers.moveItem(['dining', 'sections', sectionIndex, 'restaurants'], restaurantIndex, -1)}
                        onRemove={() => helpers.removeItem(['dining', 'sections', sectionIndex, 'restaurants'], restaurantIndex)}
                        title={restaurant?.name || `Restaurant ${restaurantIndex + 1}`}
                      >
                        <TextField disabled={disabled} label="Restaurant Name" onChange={(value) => setPath(['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'name'], value)} value={restaurant?.name ?? ''} />
                        <TextField disabled={disabled} label="Cuisine" onChange={(value) => setPath(['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'cuisine'], value)} value={restaurant?.cuisine ?? ''} />
                        <TextField disabled={disabled} label="Location" onChange={(value) => setPath(['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'location'], value)} value={restaurant?.location ?? ''} />
                        <TextField disabled={disabled} label="Phone" onChange={(value) => setPath(['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, 'phone'], value)} value={restaurant?.phone ?? ''} />
                      </ItemCard>
                    )}
                    title="Restaurants"
                  />
                </Field>
              </ItemCard>
            )}
            title="Dining Areas"
          />
        </Field>
      </SectionCard>
    </>
  )
}

function renderPropertyForSaleEditor(page, helpers) {
  const { disabled, setPath } = helpers

  return (
    <>
      <SectionCard description="This is the opening hero on the property for sale page." title="Hero Banner">
        <RichTextField disabled={disabled} label="Heading" onChange={(value) => setPath(['hero', 'title'], value)} value={page.hero?.title ?? ''} />
        <Field wide>
          <ImageField disabled={disabled} image={page.hero?.image} label="Hero Image" onChange={(field, value) => setPath(['hero', 'image', field], value)} />
        </Field>
      </SectionCard>

      <SectionCard description="This section introduces the real estate story and image." title="Story Section">
        <RichTextField disabled={disabled} label="Section Heading" onChange={(value) => setPath(['story', 'title'], value)} value={page.story?.title ?? ''} />
        <RichParagraphsField disabled={disabled} label="Story Paragraphs" onChange={(value) => setPath(['story', 'paragraphs'], value)} value={page.story?.paragraphs ?? []} />
        <Field wide>
          <ImageField disabled={disabled} image={page.story?.image} label="Story Image" onChange={(field, value) => setPath(['story', 'image', field], value)} />
        </Field>
      </SectionCard>

      <SectionCard description="This band contains the closing sales copy and contact information." title="Details And Contact">
        <RichParagraphsField disabled={disabled} label="Details Paragraphs" onChange={(value) => setPath(['details', 'paragraphs'], value)} value={page.details?.paragraphs ?? []} />
        <Field wide>
          <ImageField disabled={disabled} image={page.details?.image} label="Details Image" onChange={(field, value) => setPath(['details', 'image', field], value)} />
        </Field>
        <TextField disabled={disabled} label="Contact Name" onChange={(value) => setPath(['details', 'contact', 'name'], value)} value={page.details?.contact?.name ?? ''} />
        <TextField disabled={disabled} label="Contact Role" onChange={(value) => setPath(['details', 'contact', 'role'], value)} value={page.details?.contact?.role ?? ''} />
        <TextField disabled={disabled} label="Contact Phone" onChange={(value) => setPath(['details', 'contact', 'phone'], value)} value={page.details?.contact?.phone ?? ''} />
        <Field wide>
          <LinkFields
            disabled={disabled}
            label="Contact Website"
            link={page.details?.contact?.website}
            onHrefChange={(value) => setPath(['details', 'contact', 'website', 'href'], value)}
            onLabelChange={(value) => setPath(['details', 'contact', 'website', 'label'], value)}
          />
        </Field>
      </SectionCard>
    </>
  )
}

function renderRentalAccommodationsEditor(page, helpers) {
  const { disabled, setPath } = helpers

  return (
    <>
      <SectionCard description="This is the hero image and title above the rental directory." title="Hero Banner">
        <RichTextField disabled={disabled} label="Heading" onChange={(value) => setPath(['hero', 'title'], value)} value={page.hero?.title ?? ''} />
        <Field wide>
          <ImageField disabled={disabled} image={page.hero?.image} label="Hero Image" onChange={(field, value) => setPath(['hero', 'image', field], value)} />
        </Field>
      </SectionCard>

      <SectionCard description="These labels control the directory heading, filter prompt, and empty states. The actual rental cards come from the Properties tab." title="Directory Copy">
        <RichTextField disabled={disabled} label="Section Heading" onChange={(value) => setPath(['directory', 'title'], value)} value={page.directory?.title ?? ''} />
        <TextField disabled={disabled} label="Filter Placeholder" onChange={(value) => setPath(['directory', 'filterPlaceholder'], value)} value={page.directory?.filterPlaceholder ?? ''} />
        <TextField disabled={disabled} label="Filter Button Text" onChange={(value) => setPath(['directory', 'filterActionLabel'], value)} value={page.directory?.filterActionLabel ?? ''} />
        <TextAreaField disabled={disabled} label="Empty State When No Rentals Match" onChange={(value) => setPath(['directory', 'emptyStateAll'], value)} rows={3} value={page.directory?.emptyStateAll ?? ''} />
        <TextAreaField disabled={disabled} label="Empty State When Rentals Fail To Load" onChange={(value) => setPath(['directory', 'emptyStateUnavailable'], value)} rows={3} value={page.directory?.emptyStateUnavailable ?? ''} />
      </SectionCard>
    </>
  )
}

function renderCarBargeEditor(page, helpers) {
  const { disabled, setPath } = helpers
  const operators = Array.isArray(page.operators) ? page.operators : []

  return (
    <>
      <SectionCard description="This hero sits at the top of the car barge information page." title="Hero Banner">
        <RichTextField disabled={disabled} label="Heading" onChange={(value) => setPath(['hero', 'title'], value)} value={page.hero?.title ?? ''} />
        <Field wide>
          <ImageField disabled={disabled} image={page.hero?.image} label="Hero Image" onChange={(field, value) => setPath(['hero', 'image', field], value)} />
        </Field>
      </SectionCard>

      <SectionCard description="This section controls the fee rows and the two intro columns beneath the hero." title="Intro And Fees">
        <Field wide>
          <RepeatingSection
            addLabel="Add Fee Row"
            disabled={disabled}
            itemLabel="fee row"
            items={page.intro?.portAuthorityFees ?? []}
            onAdd={() => helpers.addItem(['intro', 'portAuthorityFees'], { label: '', value: '' })}
            renderItem={(fee, index) => (
              <ItemCard
                canMoveDown={index < (page.intro?.portAuthorityFees?.length ?? 0) - 1}
                canMoveUp={index > 0}
                disabled={disabled}
                key={fee?.id ?? `port-fee-${index}`}
                onMoveDown={() => helpers.moveItem(['intro', 'portAuthorityFees'], index, 1)}
                onMoveUp={() => helpers.moveItem(['intro', 'portAuthorityFees'], index, -1)}
                onRemove={() => helpers.removeItem(['intro', 'portAuthorityFees'], index)}
                title={fee?.label || `Fee Row ${index + 1}`}
              >
                <TextField disabled={disabled} label="Fee Label" onChange={(value) => setPath(['intro', 'portAuthorityFees', index, 'label'], value)} value={fee?.label ?? ''} />
                <TextField disabled={disabled} label="Fee Value" onChange={(value) => setPath(['intro', 'portAuthorityFees', index, 'value'], value)} value={fee?.value ?? ''} />
              </ItemCard>
            )}
            title="Port Authority Fee Rows"
          />
        </Field>

        <RichParagraphsField disabled={disabled} label="Left Column Paragraphs" onChange={(value) => setPath(['intro', 'leftParagraphs'], value)} value={page.intro?.leftParagraphs ?? []} />
        <RichParagraphsField disabled={disabled} label="Right Column Paragraphs" onChange={(value) => setPath(['intro', 'rightParagraphs'], value)} value={page.intro?.rightParagraphs ?? []} />
        <Field wide>
          <LinkFields
            disabled={disabled}
            label="Reference Link"
            link={page.intro?.referenceLink}
            onHrefChange={(value) => setPath(['intro', 'referenceLink', 'href'], value)}
            onLabelChange={(value) => setPath(['intro', 'referenceLink', 'label'], value)}
          />
        </Field>
      </SectionCard>

      <SectionCard description="These company sections control the live schedules, rates, and operator photos." title="Barge Companies">
        <Field wide>
          <RepeatingSection
            addLabel="Add Barge Company"
            disabled={disabled}
            itemLabel="barge company"
            items={operators}
            onAdd={() =>
              helpers.addItem(['operators'], {
                title: '',
                meta: { names: '', phone: '', travelTime: '' },
                image: { kind: 'image', url: '', alt: '', title: '' },
                schedules: [],
                rates: { heading: '', rows: [], footer: [], url: '' },
              })
            }
            renderItem={(operator, operatorIndex) => {
              const schedules = Array.isArray(operator?.schedules) ? operator.schedules : []
              const rateRows = Array.isArray(operator?.rates?.rows) ? operator.rates.rows : []

              return (
                <ItemCard
                  canMoveDown={operatorIndex < operators.length - 1}
                  canMoveUp={operatorIndex > 0}
                  disabled={disabled}
                  key={operator?.id ?? `barge-operator-${operatorIndex}`}
                  onMoveDown={() => helpers.moveItem(['operators'], operatorIndex, 1)}
                  onMoveUp={() => helpers.moveItem(['operators'], operatorIndex, -1)}
                  onRemove={() => helpers.removeItem(['operators'], operatorIndex)}
                  title={operator?.title || `Barge Company ${operatorIndex + 1}`}
                >
                  <TextField disabled={disabled} label="Company Heading" onChange={(value) => setPath(['operators', operatorIndex, 'title'], value)} value={operator?.title ?? ''} wide />
                  <TextField disabled={disabled} label="Barge Names" onChange={(value) => setPath(['operators', operatorIndex, 'meta', 'names'], value)} value={operator?.meta?.names ?? ''} />
                  <TextField disabled={disabled} label="Telephone" onChange={(value) => setPath(['operators', operatorIndex, 'meta', 'phone'], value)} value={operator?.meta?.phone ?? ''} />
                  <TextField disabled={disabled} label="Travel Time" onChange={(value) => setPath(['operators', operatorIndex, 'meta', 'travelTime'], value)} value={operator?.meta?.travelTime ?? ''} />

                  <Field wide>
                    <ImageField
                      disabled={disabled}
                      image={operator?.image}
                      label="Operator Image"
                      onChange={(field, value) => setPath(['operators', operatorIndex, 'image', field], value)}
                    />
                  </Field>

                  <Field wide>
                    <RepeatingSection
                      addLabel="Add Schedule Block"
                      disabled={disabled}
                      itemLabel="schedule block"
                      items={schedules}
                      onAdd={() => helpers.addItem(['operators', operatorIndex, 'schedules'], { title: '', columns: [], notes: [] })}
                      renderItem={(schedule, scheduleIndex) => {
                        const columns = Array.isArray(schedule?.columns) ? schedule.columns : []

                        return (
                          <ItemCard
                            canMoveDown={scheduleIndex < schedules.length - 1}
                            canMoveUp={scheduleIndex > 0}
                            disabled={disabled}
                            key={schedule?.id ?? `schedule-${operatorIndex}-${scheduleIndex}`}
                            onMoveDown={() => helpers.moveItem(['operators', operatorIndex, 'schedules'], scheduleIndex, 1)}
                            onMoveUp={() => helpers.moveItem(['operators', operatorIndex, 'schedules'], scheduleIndex, -1)}
                            onRemove={() => helpers.removeItem(['operators', operatorIndex, 'schedules'], scheduleIndex)}
                            title={schedule?.title || `Schedule ${scheduleIndex + 1}`}
                          >
                            <TextField disabled={disabled} label="Schedule Heading" onChange={(value) => setPath(['operators', operatorIndex, 'schedules', scheduleIndex, 'title'], value)} value={schedule?.title ?? ''} wide />
                            <RichLinesField disabled={disabled} label="Schedule Notes" onChange={(value) => setPath(['operators', operatorIndex, 'schedules', scheduleIndex, 'notes'], value)} value={schedule?.notes ?? []} />

                            <Field wide>
                              <RepeatingSection
                                addLabel="Add Schedule Column"
                                disabled={disabled}
                                itemLabel="schedule column"
                                items={columns}
                                onAdd={() => helpers.addItem(['operators', operatorIndex, 'schedules', scheduleIndex, 'columns'], { heading: '', times: [] })}
                                renderItem={(column, columnIndex) => (
                                  <ItemCard
                                    canMoveDown={columnIndex < columns.length - 1}
                                    canMoveUp={columnIndex > 0}
                                    disabled={disabled}
                                    key={column?.id ?? `schedule-column-${operatorIndex}-${scheduleIndex}-${columnIndex}`}
                                    onMoveDown={() => helpers.moveItem(['operators', operatorIndex, 'schedules', scheduleIndex, 'columns'], columnIndex, 1)}
                                    onMoveUp={() => helpers.moveItem(['operators', operatorIndex, 'schedules', scheduleIndex, 'columns'], columnIndex, -1)}
                                    onRemove={() => helpers.removeItem(['operators', operatorIndex, 'schedules', scheduleIndex, 'columns'], columnIndex)}
                                    title={column?.heading || `Column ${columnIndex + 1}`}
                                  >
                                    <TextField
                                      disabled={disabled}
                                      label="Column Heading"
                                      onChange={(value) => setPath(['operators', operatorIndex, 'schedules', scheduleIndex, 'columns', columnIndex, 'heading'], value)}
                                      value={column?.heading ?? ''}
                                      wide
                                    />
                                    <LinesField
                                      disabled={disabled}
                                      label="Times"
                                      onChange={(value) => setPath(['operators', operatorIndex, 'schedules', scheduleIndex, 'columns', columnIndex, 'times'], value)}
                                      rows={8}
                                      value={column?.times ?? []}
                                    />
                                  </ItemCard>
                                )}
                                title="Schedule Columns"
                              />
                            </Field>
                          </ItemCard>
                        )
                      }}
                      title="Schedules"
                    />
                  </Field>

                  <Field wide>
                    <TextField disabled={disabled} label="Rates Heading" onChange={(value) => setPath(['operators', operatorIndex, 'rates', 'heading'], value)} value={operator?.rates?.heading ?? ''} wide />

                    <RepeatingSection
                      addLabel="Add Rate Row"
                      disabled={disabled}
                      itemLabel="rate row"
                      items={rateRows}
                      onAdd={() => helpers.addItem(['operators', operatorIndex, 'rates', 'rows'], { label: '', values: [] })}
                      renderItem={(row, rowIndex) => (
                        <ItemCard
                          canMoveDown={rowIndex < rateRows.length - 1}
                          canMoveUp={rowIndex > 0}
                          disabled={disabled}
                          key={row?.id ?? `rate-row-${operatorIndex}-${rowIndex}`}
                          onMoveDown={() => helpers.moveItem(['operators', operatorIndex, 'rates', 'rows'], rowIndex, 1)}
                          onMoveUp={() => helpers.moveItem(['operators', operatorIndex, 'rates', 'rows'], rowIndex, -1)}
                          onRemove={() => helpers.removeItem(['operators', operatorIndex, 'rates', 'rows'], rowIndex)}
                          title={row?.label || `Rate Row ${rowIndex + 1}`}
                        >
                          <TextField disabled={disabled} label="Row Label" onChange={(value) => setPath(['operators', operatorIndex, 'rates', 'rows', rowIndex, 'label'], value)} value={row?.label ?? ''} />
                          <RichLinesField
                            disabled={disabled}
                            label="Row Values"
                            onChange={(value) => setPath(['operators', operatorIndex, 'rates', 'rows', rowIndex, 'values'], value)}
                            value={row?.values ?? []}
                          />
                        </ItemCard>
                      )}
                      title="Rate Rows"
                    />

                    <RichLinesField disabled={disabled} label="Rates Footer Lines" onChange={(value) => setPath(['operators', operatorIndex, 'rates', 'footer'], value)} value={operator?.rates?.footer ?? []} />
                    <TextField disabled={disabled} label="Rates Website Link Text" onChange={(value) => setPath(['operators', operatorIndex, 'rates', 'linkLabel'], value)} value={operator?.rates?.linkLabel ?? ''} wide />
                    <TextField disabled={disabled} label="Rates Website URL" onChange={(value) => setPath(['operators', operatorIndex, 'rates', 'url'], value)} value={operator?.rates?.url ?? ''} wide />
                  </Field>
                </ItemCard>
              )
            }}
            title="Operator Sections"
          />
        </Field>

        <TextAreaField disabled={disabled} label="Closing Note" onChange={(value) => setPath(['note'], value)} rows={4} value={page.note ?? ''} wide />
      </SectionCard>
    </>
  )
}

function renderPassengerFerryEditor(page, helpers) {
  const { disabled, setPath } = helpers
  const redHookDirections = Array.isArray(page.redHook?.directions) ? page.redHook.directions : []
  const crownBayDirections = Array.isArray(page.crownBay?.directions) ? page.crownBay.directions : []

  function renderDirectionList(sectionKey, directions) {
    return (
      <RepeatingSection
        disabled={disabled}
        itemLabel="direction"
        items={directions}
        renderItem={(direction, directionIndex) => (
          <ItemCard
            canMoveDown={directionIndex < directions.length - 1}
            canMoveUp={directionIndex > 0}
            disabled={disabled}
            key={direction?.id ?? `${sectionKey}-direction-${directionIndex}`}
            onMoveDown={() => helpers.moveItem([sectionKey, 'directions'], directionIndex, 1)}
            onMoveUp={() => helpers.moveItem([sectionKey, 'directions'], directionIndex, -1)}
            title={direction?.heading || `Direction ${directionIndex + 1}`}
          >
            <TextField disabled={disabled} label="Direction Heading" onChange={(value) => setPath([sectionKey, 'directions', directionIndex, 'heading'], value)} value={direction?.heading ?? ''} wide />
            <LinesField disabled={disabled} label="Departure Times" onChange={(value) => setPath([sectionKey, 'directions', directionIndex, 'times'], value)} rows={8} value={direction?.times ?? []} />
          </ItemCard>
        )}
        title="Direction Blocks"
      />
    )
  }

  return (
    <>
      <SectionCard description="This image sits above both ferry schedule sections." title="Hero Image">
        <Field wide>
          <ImageField disabled={disabled} image={page.hero?.image} label="Hero Image" onChange={(field, value) => setPath(['hero', 'image', field], value)} />
        </Field>
      </SectionCard>

      <SectionCard description="This is the main Red Hook ferry schedule block." title="Red Hook Ferry">
        <RichLinesField disabled={disabled} label="Heading Lines" onChange={(value) => setPath(['redHook', 'titleLines'], value)} value={page.redHook?.titleLines ?? []} />
        <LinesField disabled={disabled} label="Meta Lines" onChange={(value) => setPath(['redHook', 'meta'], value)} rows={5} value={page.redHook?.meta ?? []} />
        <Field wide>{renderDirectionList('redHook', redHookDirections)}</Field>
        <RichTextField disabled={disabled} label="Rates Heading" onChange={(value) => setPath(['redHook', 'rates', 'title'], value)} value={page.redHook?.rates?.title ?? ''} />
        <RichLinesField disabled={disabled} label="Rates Lines" onChange={(value) => setPath(['redHook', 'rates', 'lines'], value)} value={page.redHook?.rates?.lines ?? []} />
      </SectionCard>

      <SectionCard description="This is the secondary Crown Bay ferry block." title="Crown Bay Ferry">
        <RichTextField disabled={disabled} label="Section Heading" onChange={(value) => setPath(['crownBay', 'title'], value)} value={page.crownBay?.title ?? ''} />
        <RichTextField disabled={disabled} label="Route Line" onChange={(value) => setPath(['crownBay', 'routeLine'], value)} value={page.crownBay?.routeLine ?? ''} />
        <LinesField disabled={disabled} label="Meta Lines" onChange={(value) => setPath(['crownBay', 'meta'], value)} rows={6} value={page.crownBay?.meta ?? []} />
        <Field wide>{renderDirectionList('crownBay', crownBayDirections)}</Field>
      </SectionCard>
    </>
  )
}

function renderCarRentalsEditor(page, helpers) {
  const { disabled, setPath } = helpers
  const companies = Array.isArray(page.directory?.companies) ? page.directory.companies : []

  return (
    <>
      <SectionCard description="This is the opening image and message on the car rentals page." title="Hero Banner">
        <RichTextField disabled={disabled} label="Heading" onChange={(value) => setPath(['hero', 'title'], value)} value={page.hero?.title ?? ''} />
        <RichTextField disabled={disabled} label="Tagline" onChange={(value) => setPath(['hero', 'tagline'], value)} value={page.hero?.tagline ?? ''} />
        <Field wide>
          <ImageField disabled={disabled} image={page.hero?.image} label="Hero Image" onChange={(field, value) => setPath(['hero', 'image', field], value)} />
        </Field>
      </SectionCard>

      <SectionCard description="These fields control the text and company directory below the hero." title="Car Rental Directory">
        <RichTextField disabled={disabled} label="Section Heading" onChange={(value) => setPath(['directory', 'title'], value)} value={page.directory?.title ?? ''} />
        <RichTextField disabled={disabled} label="Intro Paragraph" onChange={(value) => setPath(['directory', 'introParagraph'], value)} value={page.directory?.introParagraph ?? ''} />
        <Field wide>
          <ImageField
            disabled={disabled}
            image={mergeImageFallback(page.directory?.detailImage, page.directory?.directoryImage)}
            label="Directory Image"
            onChange={(field, value) => setPath(['directory', 'directoryImage', field], value)}
          />
        </Field>

        <Field wide>
          <RepeatingSection
            addLabel="Add Rental Company"
            description="Deactivated companies stay saved here but are hidden from the public company grid."
            disabled={disabled}
            itemLabel="rental company"
            items={companies}
            onAdd={() => helpers.addItem(['directory', 'companies'], { name: '', website: '', phones: [], separator: '/', active: true })}
            renderItem={(company, companyIndex) => {
              const isActive = company?.active !== false

              return (
                <ItemCard
                  canMoveDown={companyIndex < companies.length - 1}
                  canMoveUp={companyIndex > 0}
                  disabled={disabled}
                  key={company?.id ?? `car-company-${companyIndex}`}
                  onMoveDown={() => helpers.moveItem(['directory', 'companies'], companyIndex, 1)}
                  onMoveUp={() => helpers.moveItem(['directory', 'companies'], companyIndex, -1)}
                  onRemove={() => helpers.removeItem(['directory', 'companies'], companyIndex)}
                  title={`${company?.name || `Rental Company ${companyIndex + 1}`}${isActive ? '' : ' (Deactivated)'}`}
                >
                  <TextField disabled={disabled} label="Company Name" onChange={(value) => setPath(['directory', 'companies', companyIndex, 'name'], value)} value={company?.name ?? ''} />
                  <TextField disabled={disabled} label="Website URL" onChange={(value) => setPath(['directory', 'companies', companyIndex, 'website'], value)} value={company?.website ?? ''} />
                  <LinesField disabled={disabled} label="Phone Numbers" onChange={(value) => setPath(['directory', 'companies', companyIndex, 'phones'], value)} rows={4} value={company?.phones ?? []} />
                  <TextField disabled={disabled} label="Text Between Phone Numbers" onChange={(value) => setPath(['directory', 'companies', companyIndex, 'separator'], value)} value={company?.separator ?? '/'} />
                  <Field wide>
                    <CheckboxField checked={isActive} disabled={disabled} label="Active (shown on the public site)" onChange={(value) => setPath(['directory', 'companies', companyIndex, 'active'], value)} />
                  </Field>
                </ItemCard>
              )
            }}
            title="Rental Company Rows"
          />
        </Field>
      </SectionCard>

      <SectionCard description="These notes and the detail image appear below the company list." title="Travel Notes">
        <RichTextField disabled={disabled} label="Airport Rental Paragraph" onChange={(value) => setPath(['directory', 'airportParagraph'], value)} value={page.directory?.airportParagraph ?? ''} />
        <LinesField disabled={disabled} label="Budget Phone Numbers" onChange={(value) => setPath(['directory', 'budgetPhones'], value)} rows={4} value={page.directory?.budgetPhones ?? []} />
        <RichTextField disabled={disabled} label="Dependable Rental Paragraph" onChange={(value) => setPath(['directory', 'dependableParagraph'], value)} value={page.directory?.dependableParagraph ?? ''} />
        <TextField disabled={disabled} label="Dependable Rental Phone" onChange={(value) => setPath(['directory', 'dependablePhone'], value)} value={page.directory?.dependablePhone ?? ''} />
        <Field wide>
          <ImageField disabled={disabled} image={page.directory?.detailImage} label="Detail Image" onChange={(field, value) => setPath(['directory', 'detailImage', field], value)} />
        </Field>
      </SectionCard>
    </>
  )
}

function renderCharterBoatsEditor(page, helpers) {
  const { disabled, setPath } = helpers
  const safetySections = Array.isArray(page.safety?.sections) ? page.safety.sections : []

  return (
    <>
      <SectionCard description="This is the large hero at the top of the charter boats page." title="Hero Banner">
        <RichTextField disabled={disabled} label="Heading" onChange={(value) => setPath(['hero', 'title'], value)} value={page.hero?.title ?? ''} />
        <RichTextField disabled={disabled} label="Lead Text" onChange={(value) => setPath(['hero', 'lead'], value)} value={page.hero?.lead ?? ''} />
        <Field wide>
          <ImageField disabled={disabled} image={page.hero?.image} label="Hero Image" onChange={(field, value) => setPath(['hero', 'image', field], value)} />
        </Field>
      </SectionCard>

      <SectionCard description="This section sits above the live charter listing cards." title="Intro Section">
        <RichTextField disabled={disabled} label="Section Heading" onChange={(value) => setPath(['intro', 'title'], value)} value={page.intro?.title ?? ''} />
        <RichTextField disabled={disabled} label="Intro Paragraph" onChange={(value) => setPath(['intro', 'paragraph'], value)} value={page.intro?.paragraph ?? ''} />
        <Field wide>
          <ImageField disabled={disabled} image={page.intro?.image} label="Intro Image" onChange={(field, value) => setPath(['intro', 'image', field], value)} />
        </Field>
      </SectionCard>

      <SectionCard description="The actual boat cards come from the Charters tab. This section only controls the heading above them." title="Live Charter Directory">
        <RichTextField disabled={disabled} label="Directory Heading" onChange={(value) => setPath(['directory', 'title'], value)} value={page.directory?.title ?? ''} />
      </SectionCard>

      <SectionCard description="These safety notes appear at the bottom of the page." title="Safety Section">
        <RichTextField disabled={disabled} label="Section Heading" onChange={(value) => setPath(['safety', 'title'], value)} value={page.safety?.title ?? ''} />
        <Field wide>
          <RepeatingSection
            addLabel="Add Safety Note"
            disabled={disabled}
            itemLabel="safety note"
            items={safetySections}
            onAdd={() => helpers.addItem(['safety', 'sections'], { label: '', paragraph: '', linkLabel: '', href: '' })}
            renderItem={(section, sectionIndex) => (
              <ItemCard
                canMoveDown={sectionIndex < safetySections.length - 1}
                canMoveUp={sectionIndex > 0}
                disabled={disabled}
                key={section?.id ?? `safety-note-${sectionIndex}`}
                onMoveDown={() => helpers.moveItem(['safety', 'sections'], sectionIndex, 1)}
                onMoveUp={() => helpers.moveItem(['safety', 'sections'], sectionIndex, -1)}
                onRemove={() => helpers.removeItem(['safety', 'sections'], sectionIndex)}
                title={section?.label || `Safety Note ${sectionIndex + 1}`}
              >
                <TextField disabled={disabled} label="Label" onChange={(value) => setPath(['safety', 'sections', sectionIndex, 'label'], value)} value={section?.label ?? ''} />
                <RichTextField disabled={disabled} label="Paragraph" onChange={(value) => setPath(['safety', 'sections', sectionIndex, 'paragraph'], value)} value={section?.paragraph ?? ''} />
                <TextField disabled={disabled} label="Link Text" onChange={(value) => setPath(['safety', 'sections', sectionIndex, 'linkLabel'], value)} value={section?.linkLabel ?? ''} wide />
                <TextField disabled={disabled} label="Link URL" onChange={(value) => setPath(['safety', 'sections', sectionIndex, 'href'], value)} value={section?.href ?? ''} wide />
              </ItemCard>
            )}
            title="Safety Notes"
          />
        </Field>
      </SectionCard>
    </>
  )
}

function renderRichContentEditor(page, helpers) {
  const { disabled, setPath } = helpers
  const imageGallery = Array.isArray(page.imageGallery) ? page.imageGallery : []

  return (
    <>
      <SectionCard description="This page uses a rich content body instead of structured landing page sections." title="Page Basics">
        <TextAreaField disabled={disabled} label="Page Title" onChange={(value) => setPath(['title'], value)} rows={2} value={page.title ?? ''} />
        <TextAreaField disabled={disabled} label="Search Description" onChange={(value) => setPath(['metaDescription'], value)} rows={4} value={page.metaDescription ?? ''} />
      </SectionCard>

      <SectionCard description="Paste or edit the live HTML that appears on the page. A preview is shown below the editor." title="Page Body">
        <Field wide>
          <HtmlField disabled={disabled} label="Body HTML" onChange={(value) => setPath(['bodyHtml'], value)} value={page.bodyHtml ?? ''} />
        </Field>
      </SectionCard>

      <SectionCard description="These images appear after the page body." title="Page Gallery">
        <Field wide>
          <RepeatingSection
            addLabel="Add Gallery Image"
            disabled={disabled}
            itemLabel="gallery image"
            items={imageGallery}
            onAdd={() => helpers.addItem(['imageGallery'], { kind: 'image', url: '', alt: '', title: '' })}
            renderItem={(image, imageIndex) => (
              <ItemCard
                canMoveDown={imageIndex < imageGallery.length - 1}
                canMoveUp={imageIndex > 0}
                disabled={disabled}
                key={image?.id ?? `gallery-image-${imageIndex}`}
                onMoveDown={() => helpers.moveItem(['imageGallery'], imageIndex, 1)}
                onMoveUp={() => helpers.moveItem(['imageGallery'], imageIndex, -1)}
                onRemove={() => helpers.removeItem(['imageGallery'], imageIndex)}
                title={image?.title || image?.alt || `Gallery Image ${imageIndex + 1}`}
              >
                <Field wide>
                  <ImageField
                    disabled={disabled}
                    image={image}
                    label="Gallery Image"
                    onChange={(field, value) => setPath(['imageGallery', imageIndex, field], value)}
                  />
                </Field>
              </ItemCard>
            )}
            title="Gallery Images"
          />
        </Field>
      </SectionCard>
    </>
  )
}

function renderStructuredPageEditor(page, helpers) {
  switch (page?.contentModel) {
    case 'home':
      return renderHomeEditor(page, helpers)
    case 'about':
      return renderAboutPageEditor(page, helpers)
    case 'house-rentals':
      return renderHouseRentalsEditor(page, helpers)
    case 'advertise':
      return renderAdvertiseEditor(page, helpers)
    case 'local-attractions':
      return renderLocalAttractionsEditor(page, helpers)
    case 'property-for-sale':
      return renderPropertyForSaleEditor(page, helpers)
    case 'rental-accommodations':
      return renderRentalAccommodationsEditor(page, helpers)
    case 'car-barge-information':
      return renderCarBargeEditor(page, helpers)
    case 'passenger-ferry':
      return renderPassengerFerryEditor(page, helpers)
    case 'st-john-car-rentals':
      return renderCarRentalsEditor(page, helpers)
    case 'charter-boats':
      return renderCharterBoatsEditor(page, helpers)
    case 'rich-content-page':
    case 'legal-content-page':
      return renderRichContentEditor(page, helpers)
    default:
      return (
        <section className="admin-content-section">
          <div className="admin-content-section-header">
            <div>
              <h4>Unsupported Page Model</h4>
              <p>This page still needs a custom editor surface.</p>
            </div>
          </div>
        </section>
      )
  }
}

export function AdminStructuredPageEditor({ page, onChange, disabled = false }) {
  const helpers = {
    disabled,
    setPath(path, nextValue) {
      onChange((currentValue) => updateValueAtPath(currentValue, path, nextValue))
    },
    addItem(path, nextItem) {
      // Every repeating-section item gets a stable id so list rows can be keyed by
      // identity instead of array index — otherwise reordering/removing a row causes
      // React to reuse a stateful editor (e.g. AdminRichTextEditor) across two
      // different logical items, which can misattribute in-progress edits.
      onChange((currentValue) => addArrayItemAtPath(currentValue, path, { id: makeStructuredItemId(), ...nextItem }))
    },
    removeItem(path, index) {
      onChange((currentValue) => removeArrayItemAtPath(currentValue, path, index))
    },
    moveItem(path, index, offset) {
      onChange((currentValue) => moveArrayItemAtPath(currentValue, path, index, offset))
    },
  }

  if (!page) {
    return null
  }

  return <div className="admin-content-editor">{renderStructuredPageEditor(page, helpers)}</div>
}

// A dedicated one-row-per-company form for the car rentals company list — plain
// text/checkbox inputs in a compact table, not the card-preview grid the public
// site renders and not the stacked multi-field ItemCard style used elsewhere in
// this file. Add, edit, deactivate, and delete all happen here as simple rows.
export function CarRentalCompaniesPanel({ page, onChange, disabled = false }) {
  const companies = Array.isArray(page?.directory?.companies) ? page.directory.companies : []

  function setCompanyField(index, field, value) {
    onChange((currentValue) => updateValueAtPath(currentValue, ['directory', 'companies', index, field], value))
  }

  function setCompanyPhones(index, value) {
    const phones = String(value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    setCompanyField(index, 'phones', phones)
  }

  function addCompany() {
    onChange((currentValue) =>
      addArrayItemAtPath(currentValue, ['directory', 'companies'], {
        id: makeStructuredItemId(),
        name: '',
        website: '',
        phones: [],
        separator: '/',
        active: true,
      }),
    )
  }

  function removeCompany(index) {
    onChange((currentValue) => removeArrayItemAtPath(currentValue, ['directory', 'companies'], index))
  }

  if (!page) {
    return null
  }

  return (
    <section className="admin-content-section admin-car-companies-panel">
      <div className="admin-content-section-header">
        <div>
          <h4>Car Rental Companies</h4>
          <p>One row per company. Deactivated companies stay saved here but are hidden from the public site.</p>
        </div>
        <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={addCompany}>
          Add company
        </button>
      </div>

      <div className="admin-car-companies-list">
        <div className="admin-car-companies-row admin-car-companies-row--header">
          <span>Name</span>
          <span>Website URL</span>
          <span>Phone number(s)</span>
          <span>Active</span>
          <span />
        </div>

        {companies.length === 0 ? <p className="admin-note">No rental companies yet.</p> : null}

        {companies.map((company, index) => {
          const isActive = company?.active !== false

          return (
            <div className="admin-car-companies-row" key={company?.id ?? index}>
              <input
                disabled={disabled}
                placeholder="Company name"
                type="text"
                value={company?.name ?? ''}
                onChange={(event) => setCompanyField(index, 'name', event.target.value)}
              />
              <input
                disabled={disabled}
                placeholder="https://example.com"
                type="text"
                value={company?.website ?? ''}
                onChange={(event) => setCompanyField(index, 'website', event.target.value)}
              />
              <input
                disabled={disabled}
                placeholder="340-555-1234, 340-555-5678"
                type="text"
                value={(company?.phones ?? []).join(', ')}
                onChange={(event) => setCompanyPhones(index, event.target.value)}
              />
              <label className="admin-checkbox-field admin-checkbox-field--compact">
                <input
                  checked={isActive}
                  disabled={disabled}
                  type="checkbox"
                  onChange={(event) => setCompanyField(index, 'active', event.target.checked)}
                />
              </label>
              <button className="button-link button-link--ghost" disabled={disabled} type="button" onClick={() => removeCompany(index)}>
                Delete
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
