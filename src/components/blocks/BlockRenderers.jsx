import { useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { BlockList } from '../BlockList'
import { BlockStyleFrame } from '../BlockStyleFrame'
import { EditorIconButton } from '../EditorIconButton'
import { CharterDirectorySection } from '../CharterDirectorySection'
import { EditablePhoneText } from '../EditablePhoneText'
import { PropertyDirectorySection } from '../PropertyDirectorySection'
import { EditableBackgroundSection, EditableImage, EditableLink, EditableRichHtml, EditableText } from '../AdminInlinePageEdit'
import { getContentImageSrc } from '../../lib/contentAssets'
import { createBlockCollectionItem } from '../../lib/blockDefaults'
import { getBlockImageAltText } from '../../lib/blockImageValue'
import { getRowMobileColumnOrder, getRowMobileColumnsMode } from '../../lib/blockResponsive'
import { applyRowLayoutPreset, getRowLayoutPresetId, ROW_LAYOUT_PRESETS } from '../../lib/blockRowLayout'
import { makeBlockTreeSelectionId } from '../../lib/blockTree'
import { normalizeSiteHtml } from '../../lib/normalizeSiteHtml'
import { submitPageInquiry } from '../../lib/pageInquiryApi'
import { appendPathItem, removePathItem, usePageEditor } from '../../lib/usePageEditor'
import { useSiteShellContent } from '../../lib/useSiteContent'

function makeItemId() {
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// Fields like a schedule column's times, a rate row's values, or a business's phone
// numbers are plain string arrays with nothing to key list rows by — removing an
// earlier row shifts every later row's index, and React reuses (and desyncs) whichever
// editable text field used to live at that index. ids gives each string a stable
// identity without changing the stored value shape: existing data with no id array
// yet just falls back to index keys until the array is first edited, at which point
// this backfills one id per existing item before the add/remove goes through, so ids
// and values always stay aligned one-to-one from then on.
function ensureAlignedIds(ids, length) {
  const aligned = Array.isArray(ids) ? ids.slice(0, length) : []

  while (aligned.length < length) {
    aligned.push(makeItemId())
  }

  return aligned
}

function appendStableStringItem(pageEditor, objectPath, valuesField, idsField, value = '') {
  pageEditor?.updatePath(objectPath, (currentValue) => {
    const record = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue) ? currentValue : {}
    const values = Array.isArray(record[valuesField]) ? record[valuesField] : []
    const ids = ensureAlignedIds(record[idsField], values.length)

    return {
      ...record,
      [valuesField]: [...values, value],
      [idsField]: [...ids, makeItemId()],
    }
  })
}

function removeStableStringItem(pageEditor, objectPath, valuesField, idsField, index) {
  pageEditor?.updatePath(objectPath, (currentValue) => {
    const record = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue) ? currentValue : {}
    const values = Array.isArray(record[valuesField]) ? record[valuesField] : []
    const ids = ensureAlignedIds(record[idsField], values.length)

    return {
      ...record,
      [valuesField]: values.filter((_, itemIndex) => itemIndex !== index),
      [idsField]: ids.filter((_, itemIndex) => itemIndex !== index),
    }
  })
}

export function RichTextBlockRenderer({ block, path }) {
  const html = normalizeSiteHtml(block.html ?? '').trim()

  return <EditableRichHtml className="block-rich-text" html={html} path={[...path, 'html']} title="Block Text" />
}

export function ImageBlockRenderer({ block, path }) {
  const image = block.image ?? { kind: 'image' }
  const imageUrl = getContentImageSrc(image, { width: 1200 })

  return (
    <figure className="block-image">
      <EditableImage alt={getBlockImageAltText(image)} className="block-image-photo" decoding="async" image={image} loading="lazy" path={[...path, 'image']} src={imageUrl} />
      <EditableText as="figcaption" className="block-image-caption" label="Caption" multiline path={[...path, 'caption']} rows={2} value={block.caption ?? ''}>
        {block.caption ?? ''}
      </EditableText>
    </figure>
  )
}

export function ImageGalleryBlockRenderer({ block, path }) {
  const pageEditor = usePageEditor()
  const images = Array.isArray(block.images) ? block.images : []
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const controlsVisible = editable && pageEditor.selectedBlockId === block.id

  function addImage() {
    appendPathItem(pageEditor, [...path, 'images'], images, createBlockCollectionItem('image-gallery', 'images', { makeId: makeItemId }))
  }

  function removeImage(index) {
    removePathItem(pageEditor, [...path, 'images'], images, index)
  }

  return (
    <section aria-label="Image gallery" className="block-image-gallery">
      {images.map((image, index) => (
        <figure className="block-image-gallery-item" key={image?.id ?? index}>
          <EditableImage
            alt={getBlockImageAltText(image)}
            className="block-image-gallery-image"
            decoding="async"
            image={image}
            loading="lazy"
            path={[...path, 'images', index]}
            src={getContentImageSrc(image, { height: 720, width: 960 })}
          />
          {String(image?.title ?? '').trim() ? (
            <EditableText as="figcaption" className="block-image-gallery-caption" label={`Image ${index + 1} Title`} path={[...path, 'images', index, 'title']} value={image?.title ?? ''}>
              {image?.title ?? ''}
            </EditableText>
          ) : null}
          {controlsVisible ? (
            <EditorIconButton
              className="block-image-gallery-remove block-inline-command"
              data-admin-inline-editable="true"
              icon={Trash2}
              label="Remove image"
              tone="danger"
              onClick={() => removeImage(index)}
            />
          ) : null}
        </figure>
      ))}
      {controlsVisible ? (
        <EditorIconButton className="block-image-gallery-add block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add image" onClick={addImage} />
      ) : null}
    </section>
  )
}

export function CtaBandBlockRenderer({ block, path }) {
  const action = block.action ?? {}

  return (
    <section className="block-cta-band">
      <div className="block-cta-band-inner">
        <EditableText as="h2" label="CTA Title" multiline path={[...path, 'title']} rows={3} value={block.title ?? ''}>
          {block.title ?? ''}
        </EditableText>
        <EditableText as="p" label="CTA Body" multiline path={[...path, 'body']} rows={4} value={block.body ?? ''}>
          {block.body ?? ''}
        </EditableText>
        <EditableLink
          allowExternalUrl
          allowRouteSelection
          buttonColor={action.backgroundColor}
          buttonColorPath={[...path, 'action', 'backgroundColor']}
          className="block-cta-band-button"
          destination={action.path ?? ''}
          destinationField="path"
          destinationLabel="Button Link"
          destinationPath={[...path, 'action', 'path']}
          link={action}
          linkPath={[...path, 'action']}
          label={action.label ?? ''}
          labelLabel="Button Text"
          labelPath={[...path, 'action', 'label']}
          presentation="button"
        />
      </div>
    </section>
  )
}

const SPACER_SIZES = ['small', 'medium', 'large']

export function SpacerBlockRenderer({ block }) {
  const size = SPACER_SIZES.includes(block.size) ? block.size : 'medium'

  return <div className={`block-spacer block-spacer--${size}`} />
}

export function SpacerBlockSettings({ block, path }) {
  const pageEditor = usePageEditor()
  const size = SPACER_SIZES.includes(block.size) ? block.size : 'medium'

  function handleSizeChange(event) {
    pageEditor?.updatePath([...path, 'size'], event.target.value)
  }

  return (
    <label className="block-toolbar-setting">
      <span>Size</span>
      <select data-admin-inline-editable="true" value={size} onChange={handleSizeChange}>
        <option value="small">Small</option>
        <option value="medium">Medium</option>
        <option value="large">Large</option>
      </select>
    </label>
  )
}

export function HeroBannerBlockRenderer({ block, path }) {
  const image = block.image ?? { kind: 'image' }
  const heroImageUrl = getContentImageSrc(image, { height: 900, width: 1920 })
  const action = block.action ?? {}

  return (
    <EditableBackgroundSection
      as="section"
      className="block-hero"
      image={image}
      path={[...path, 'image']}
      style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
    >
      <div className="block-hero-inner">
        <EditableText as="h1" label="Hero Title" multiline path={[...path, 'title']} rows={3} value={block.title ?? ''}>
          {block.title ?? ''}
        </EditableText>
        <EditableText as="p" label="Hero Lead" multiline path={[...path, 'lead']} rows={3} value={block.lead ?? ''}>
          {block.lead ?? ''}
        </EditableText>
        <EditableLink
          allowExternalUrl
          allowRouteSelection
          buttonColor={action.backgroundColor}
          buttonColorPath={[...path, 'action', 'backgroundColor']}
          className="block-hero-button"
          destination={action.path ?? ''}
          destinationField="path"
          destinationLabel="Button Link"
          destinationPath={[...path, 'action', 'path']}
          link={action}
          linkPath={[...path, 'action']}
          label={action.label ?? ''}
          labelLabel="Button Text"
          labelPath={[...path, 'action', 'label']}
          presentation="button"
        />
      </div>
    </EditableBackgroundSection>
  )
}

export function ImageTextSplitBlockRenderer({ block, path }) {
  const image = block.image ?? { kind: 'image' }
  const imageUrl = getContentImageSrc(image, { height: 720, width: 960 })
  const imagePosition = block.imagePosition === 'right' ? 'right' : 'left'
  const action = block.action ?? {}

  return (
    <section className={`block-split block-split--image-${imagePosition}`}>
      <div className="block-split-inner">
        <div className="block-split-media">
          <EditableImage
            alt={getBlockImageAltText(image)}
            className="block-split-image"
            decoding="async"
            image={image}
            loading="lazy"
            path={[...path, 'image']}
            src={imageUrl}
          />
        </div>
        <div className="block-split-copy">
          <EditableText as="p" className="block-split-kicker" label="Kicker" path={[...path, 'kicker']} value={block.kicker ?? ''}>
            {block.kicker ?? ''}
          </EditableText>
          <EditableText as="h2" label="Title" multiline path={[...path, 'title']} rows={3} value={block.title ?? ''}>
            {block.title ?? ''}
          </EditableText>
          <EditableRichHtml className="block-split-body" html={normalizeSiteHtml(block.body ?? '').trim()} path={[...path, 'body']} title="Body Text" />
          <EditableLink
            allowExternalUrl
            allowRouteSelection
            className="block-split-link"
            destination={action.path ?? ''}
            destinationField="path"
            destinationLabel="Link URL"
            destinationPath={[...path, 'action', 'path']}
            link={action}
            linkPath={[...path, 'action']}
            label={action.label ?? ''}
            labelLabel="Link Text"
            labelPath={[...path, 'action', 'label']}
          />
        </div>
      </div>
    </section>
  )
}

export function ImageTextSplitBlockSettings({ block, path }) {
  const pageEditor = usePageEditor()
  const imagePosition = block.imagePosition === 'right' ? 'right' : 'left'

  function handlePositionChange(event) {
    pageEditor?.updatePath([...path, 'imagePosition'], event.target.value)
  }

  return (
    <label className="block-toolbar-setting">
      <span>Image side</span>
      <select data-admin-inline-editable="true" value={imagePosition} onChange={handlePositionChange}>
        <option value="left">Left</option>
        <option value="right">Right</option>
      </select>
    </label>
  )
}

const FEATURE_ICON_KINDS = ['star', 'check', 'pin', 'tag']

function BlockFeatureIcon({ kind }) {
  if (kind === 'check') {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48">
        <path d="M10 25l9 9 19-19" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      </svg>
    )
  }

  if (kind === 'pin') {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48">
        <path
          d="M24 6c-7 0-12.5 5.5-12.5 12.5C11.5 28 24 42 24 42s12.5-14 12.5-23.5C36.5 11.5 31 6 24 6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <circle cx="24" cy="18.5" fill="currentColor" r="4.5" />
      </svg>
    )
  }

  if (kind === 'tag') {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48">
        <path d="M8 8h16l16 16-16 16-16-16Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2.5" />
        <circle cx="16" cy="16" fill="currentColor" r="2.5" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 48 48">
      <path
        d="M24 6l4.9 10 11 1.6-8 7.8 1.9 11-9.8-5.2-9.8 5.2 1.9-11-8-7.8 11-1.6Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
    </svg>
  )
}

export function FeatureGridBlockRenderer({ block, path }) {
  const pageEditor = usePageEditor()
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const controlsVisible = editable && pageEditor.selectedBlockId === block.id
  const items = Array.isArray(block.items) ? block.items : []

  function addItem() {
    appendPathItem(pageEditor, [...path, 'items'], items, createBlockCollectionItem('feature-grid', 'items', { makeId: makeItemId }))
  }

  function removeItem(index) {
    removePathItem(pageEditor, [...path, 'items'], items, index)
  }

  return (
    <section className="block-feature-grid">
      <EditableText as="h2" label="Feature Grid Title" multiline path={[...path, 'title']} rows={3} value={block.title ?? ''}>
        {block.title ?? ''}
      </EditableText>

      <div className="block-feature-grid-items">
        {items.map((item, index) => (
          <article className="block-feature-grid-item" key={item.id ?? index}>
            <div className="block-feature-grid-icon">
              <BlockFeatureIcon kind={item.kind} />
            </div>
            {controlsVisible ? (
              <select
                className="block-feature-grid-icon-select block-inline-setting"
                data-admin-inline-editable="true"
                value={item.kind}
                onChange={(event) => pageEditor?.updatePath([...path, 'items', index, 'kind'], event.target.value)}
              >
                {FEATURE_ICON_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            ) : null}
            <EditableText as="h3" label={`Feature ${index + 1} Title`} path={[...path, 'items', index, 'title']} value={item.title ?? ''}>
              {item.title ?? ''}
            </EditableText>
            <EditableText
              as="p"
              label={`Feature ${index + 1} Description`}
              multiline
              path={[...path, 'items', index, 'body']}
              rows={4}
              value={item.body ?? ''}
            >
              {item.body ?? ''}
            </EditableText>
            {controlsVisible ? (
              <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label="Remove feature" tone="danger" onClick={() => removeItem(index)} />
            ) : null}
          </article>
        ))}
      </div>

      {controlsVisible ? (
        <EditorIconButton className="block-feature-grid-add block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add feature" onClick={addItem} />
      ) : null}
    </section>
  )
}

export function TestimonialsBlockRenderer({ block, path }) {
  const pageEditor = usePageEditor()
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const controlsVisible = editable && pageEditor.selectedBlockId === block.id
  const items = Array.isArray(block.items) ? block.items : []

  function addItem() {
    appendPathItem(pageEditor, [...path, 'items'], items, createBlockCollectionItem('testimonials', 'items', { makeId: makeItemId }))
  }

  function removeItem(index) {
    removePathItem(pageEditor, [...path, 'items'], items, index)
  }

  return (
    <section className="block-testimonials">
      <div className="block-testimonials-grid">
        {items.map((item, index) => (
          <figure className="block-testimonials-item" key={item.id ?? index}>
            <EditableText
              as="blockquote"
              label={`Testimonial ${index + 1} Quote`}
              multiline
              path={[...path, 'items', index, 'quote']}
              rows={4}
              value={item.quote ?? ''}
            >
              {item.quote ?? ''}
            </EditableText>
            <EditableText as="figcaption" label={`Testimonial ${index + 1} Author`} path={[...path, 'items', index, 'author']} value={item.author ?? ''}>
              {item.author ?? ''}
            </EditableText>
            {controlsVisible ? (
              <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label="Remove testimonial" tone="danger" onClick={() => removeItem(index)} />
            ) : null}
          </figure>
        ))}
      </div>

      {controlsVisible ? (
        <EditorIconButton className="block-testimonials-add block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add testimonial" onClick={addItem} />
      ) : null}
    </section>
  )
}

function buildInquiryMailtoHref(contactEmail, { firstName, lastName, email, subject, message }) {
  const composedBody = [`First name: ${firstName}`, `Last name: ${lastName}`, `Email: ${email}`, '', message].join('\n')

  return `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(composedBody)}`
}

export function ContactFormBlockRenderer({ block, context = {}, path }) {
  const page = context.page
  const pageEditor = usePageEditor()
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const siteShell = useSiteShellContent()
  const contactEmail = siteShell?.contact?.primaryEmail ?? ''
  const [submitStatus, setSubmitStatus] = useState('idle')
  const [submitMessage, setSubmitMessage] = useState('')
  const [manualSubmitHref, setManualSubmitHref] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    if (editable) {
      return
    }

    const form = event.currentTarget
    const formData = new FormData(form)
    const firstName = String(formData.get('firstName') ?? '').trim()
    const lastName = String(formData.get('lastName') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const message = String(formData.get('message') ?? '').trim()
    const website = String(formData.get('website') ?? '').trim()
    const subject = block.title || `New inquiry from ${page?.title || page?.navLabel || 'the website'}`

    setSubmitStatus('submitting')
    setSubmitMessage('')
    setManualSubmitHref('')

    try {
      const result = await submitPageInquiry({
        firstName,
        lastName,
        email,
        message,
        website,
        subject,
        pageTitle: page?.title || page?.navLabel || '',
        pagePath: page?.path || '',
      })

      form.reset()

      if (result?.inquiry?.accepted) {
        setSubmitStatus('success')
        setSubmitMessage('Thanks. Your message has been received.')
      } else {
        setSubmitStatus('error')
        setSubmitMessage('We could not send your message right now.')
      }
    } catch (error) {
      setSubmitStatus('error')
      setSubmitMessage(error instanceof Error ? error.message : 'We could not send your message right now.')

      if (contactEmail) {
        setManualSubmitHref(buildInquiryMailtoHref(contactEmail, { firstName, lastName, email, subject, message }))
      }
    }
  }

  return (
    <section className="block-contact-form">
      <div className="block-contact-form-inner">
        <EditableText as="h2" label="Form Title" multiline path={[...path, 'title']} rows={3} value={block.title ?? ''}>
          {block.title ?? ''}
        </EditableText>
        <EditableText as="p" label="Form Intro" multiline path={[...path, 'intro']} rows={4} value={block.intro ?? ''}>
          {block.intro ?? ''}
        </EditableText>

        <form className="block-contact-form-fields" data-admin-inline-editable="true" onSubmit={handleSubmit}>
          <label aria-hidden="true" className="block-contact-form-honeypot" htmlFor={`website-${block.id ?? page?.key ?? 'page'}`}>
            <span>Website</span>
            <input autoComplete="off" id={`website-${block.id ?? page?.key ?? 'page'}`} name="website" tabIndex={-1} type="text" />
          </label>

          <div className="block-contact-form-grid">
            <label className="block-contact-form-field">
              <span>First Name</span>
              <input disabled={submitStatus === 'submitting'} name="firstName" required type="text" />
            </label>
            <label className="block-contact-form-field">
              <span>Last Name</span>
              <input disabled={submitStatus === 'submitting'} name="lastName" required type="text" />
            </label>
            <label className="block-contact-form-field block-contact-form-field--full">
              <span>Email</span>
              <input disabled={submitStatus === 'submitting'} name="email" required type="email" />
            </label>
            <label className="block-contact-form-field block-contact-form-field--full">
              <span>Message</span>
              <textarea disabled={submitStatus === 'submitting'} name="message" required rows={5} />
            </label>
          </div>

          <button className="button-link button-link--primary block-contact-form-submit" disabled={editable || submitStatus === 'submitting'} type="submit">
            {submitStatus === 'submitting' ? 'Sending...' : 'Send Message'}
          </button>

          {submitMessage ? (
            <p aria-live="polite" className={`block-contact-form-feedback block-contact-form-feedback--${submitStatus === 'error' ? 'error' : 'success'}`}>
              {submitMessage}
            </p>
          ) : null}

          {manualSubmitHref ? (
            <p aria-live="polite" className="block-contact-form-feedback">
              If the website submission is unavailable, use the pre-filled fallback link:{' '}
              <a href={manualSubmitHref}>Send your message</a>.
            </p>
          ) : null}
        </form>
      </div>
    </section>
  )
}

export function DirectoryEmbedBlockRenderer({ block, path }) {
  const pageEditor = usePageEditor()
  const source = block.source === 'charters' ? 'charters' : 'properties'
  const hasTitleText = Boolean(String(block.title ?? '').trim())

  const titleNode =
    pageEditor || hasTitleText ? (
      <EditableText as="span" label="Directory Title" path={[...path, 'title']} value={block.title ?? ''}>
        {block.title ?? ''}
      </EditableText>
    ) : null

  return (
    <div className="block-directory-embed">
      {source === 'charters' ? <CharterDirectorySection title={titleNode} /> : <PropertyDirectorySection title={titleNode} />}
    </div>
  )
}

export function DirectoryEmbedBlockSettings({ block, path }) {
  const pageEditor = usePageEditor()
  const source = block.source === 'charters' ? 'charters' : 'properties'

  function handleSourceChange(event) {
    pageEditor?.updatePath([...path, 'source'], event.target.value)
  }

  return (
    <label className="block-toolbar-setting">
      <span>Source</span>
      <select data-admin-inline-editable="true" value={source} onChange={handleSourceChange}>
        <option value="properties">Rental Properties</option>
        <option value="charters">Charter Boats</option>
      </select>
    </label>
  )
}

const CONTACT_DETAIL_TYPES = ['text', 'phone', 'link']

export function ContactDetailsBlockRenderer({ block, path }) {
  const pageEditor = usePageEditor()
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const controlsVisible = editable && pageEditor.selectedBlockId === block.id
  const items = Array.isArray(block.items) ? block.items : []

  function addItem() {
    appendPathItem(pageEditor, [...path, 'items'], items, createBlockCollectionItem('contact-details', 'items', { makeId: makeItemId }))
  }

  function removeItem(index) {
    removePathItem(pageEditor, [...path, 'items'], items, index)
  }

  function handleTypeChange(index, event) {
    pageEditor?.updatePath([...path, 'items', index, 'type'], event.target.value)
  }

  return (
    <div className="block-contact-details">
      {items.map((item, index) => {
        const ValueComponent = item.type === 'phone' ? EditablePhoneText : EditableText

        return (
          <div className="block-contact-details-row" key={item.id ?? index}>
            <EditableText
              as="span"
              className="block-contact-details-label"
              label={`Detail ${index + 1} Label`}
              path={[...path, 'items', index, 'label']}
              value={item.label ?? ''}
            >
              {item.label ?? ''}
            </EditableText>
            {item.type === 'link' ? (
              <EditableLink
                allowExternalUrl
                className="block-contact-details-value"
                destination={item.href ?? ''}
                destinationField="href"
                destinationLabel={`Detail ${index + 1} Link URL`}
                destinationPath={[...path, 'items', index, 'href']}
                external
                link={item}
                linkPath={[...path, 'items', index]}
                label={item.value ?? ''}
                labelLabel={`Detail ${index + 1} Link Text`}
                labelPath={[...path, 'items', index, 'value']}
              />
            ) : (
              <ValueComponent
                as="span"
                className="block-contact-details-value"
                label={`Detail ${index + 1} Value`}
                path={[...path, 'items', index, 'value']}
                value={item.value ?? ''}
              >
                {item.value ?? ''}
              </ValueComponent>
            )}
            {controlsVisible ? (
              <>
                <select className="block-inline-setting" data-admin-inline-editable="true" value={item.type ?? 'text'} onChange={(event) => handleTypeChange(index, event)}>
                  {CONTACT_DETAIL_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label={`Remove detail ${index + 1}`} tone="danger" onClick={() => removeItem(index)} />
              </>
            ) : null}
          </div>
        )
      })}
      {controlsVisible ? (
        <EditorIconButton className="block-contact-details-add block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add detail" onClick={addItem} />
      ) : null}
    </div>
  )
}

export function ScheduleBlockRenderer({ block, path }) {
  const pageEditor = usePageEditor()
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const controlsVisible = editable && pageEditor.selectedBlockId === block.id
  const columns = Array.isArray(block.columns) ? block.columns : []
  const notes = Array.isArray(block.notes) ? block.notes : []

  function addColumn() {
    appendPathItem(pageEditor, [...path, 'columns'], columns, createBlockCollectionItem('schedule', 'columns', { makeId: makeItemId }))
  }

  function removeColumn(columnIndex) {
    removePathItem(pageEditor, [...path, 'columns'], columns, columnIndex)
  }

  function addTime(columnIndex) {
    appendStableStringItem(pageEditor, [...path, 'columns', columnIndex], 'times', 'timeIds')
  }

  function removeTime(columnIndex, timeIndex) {
    removeStableStringItem(pageEditor, [...path, 'columns', columnIndex], 'times', 'timeIds', timeIndex)
  }

  function addNote() {
    appendStableStringItem(pageEditor, path, 'notes', 'noteIds')
  }

  function removeNote(noteIndex) {
    removeStableStringItem(pageEditor, path, 'notes', 'noteIds', noteIndex)
  }

  return (
    <section className="block-schedule">
      <EditableText as="h2" label="Schedule Title" path={[...path, 'title']} value={block.title ?? ''}>
        {block.title ?? ''}
      </EditableText>

      <div className="block-schedule-columns">
        {columns.map((column, columnIndex) => (
          <div className="block-schedule-column" key={column.id ?? columnIndex}>
            <EditableText
              as="h3"
              label={`Column ${columnIndex + 1} Heading`}
              path={[...path, 'columns', columnIndex, 'heading']}
              value={column.heading ?? ''}
            >
              {column.heading ?? ''}
            </EditableText>

            <div className="block-schedule-time-list">
              {(column.times ?? []).map((time, timeIndex) => (
                <div className="block-schedule-time-row" key={column.timeIds?.[timeIndex] ?? timeIndex}>
                  <EditableText
                    as="span"
                    label={`Column ${columnIndex + 1} Time ${timeIndex + 1}`}
                    path={[...path, 'columns', columnIndex, 'times', timeIndex]}
                    value={time}
                  >
                    {time}
                  </EditableText>
                  {controlsVisible ? (
                    <EditorIconButton
                      className="block-inline-command"
                      data-admin-inline-editable="true"
                      icon={Trash2}
                      label={`Remove time ${timeIndex + 1}`}
                      tone="danger"
                      onClick={() => removeTime(columnIndex, timeIndex)}
                    />
                  ) : null}
                </div>
              ))}
            </div>

            {controlsVisible ? (
              <div className="block-schedule-column-actions">
                <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add time" onClick={() => addTime(columnIndex)} />
                <EditorIconButton
                  className="block-inline-command"
                  data-admin-inline-editable="true"
                  icon={Trash2}
                  label="Remove column"
                  tone="danger"
                  onClick={() => removeColumn(columnIndex)}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {controlsVisible ? (
        <EditorIconButton className="block-schedule-add-column block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add column" onClick={addColumn} />
      ) : null}

      <div className="block-schedule-notes">
        {notes.map((note, noteIndex) => (
          <div className="block-schedule-note-row" key={block.noteIds?.[noteIndex] ?? noteIndex}>
            <EditableText as="p" label={`Note ${noteIndex + 1}`} multiline path={[...path, 'notes', noteIndex]} rows={2} value={note}>
              {note}
            </EditableText>
            {controlsVisible ? (
              <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label={`Remove note ${noteIndex + 1}`} tone="danger" onClick={() => removeNote(noteIndex)} />
            ) : null}
          </div>
        ))}
        {controlsVisible ? (
          <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add note" onClick={addNote} />
        ) : null}
      </div>
    </section>
  )
}

export function RateTableBlockRenderer({ block, path }) {
  const pageEditor = usePageEditor()
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const controlsVisible = editable && pageEditor.selectedBlockId === block.id
  const rows = Array.isArray(block.rows) ? block.rows : []
  const footer = Array.isArray(block.footer) ? block.footer : []
  const link = block.link ?? {}

  function addRow() {
    appendPathItem(pageEditor, [...path, 'rows'], rows, createBlockCollectionItem('rate-table', 'rows', { makeId: makeItemId }))
  }

  function removeRow(rowIndex) {
    removePathItem(pageEditor, [...path, 'rows'], rows, rowIndex)
  }

  function addValue(rowIndex) {
    appendStableStringItem(pageEditor, [...path, 'rows', rowIndex], 'values', 'valueIds')
  }

  function removeValue(rowIndex, valueIndex) {
    removeStableStringItem(pageEditor, [...path, 'rows', rowIndex], 'values', 'valueIds', valueIndex)
  }

  function addFooterLine() {
    appendStableStringItem(pageEditor, path, 'footer', 'footerIds')
  }

  function removeFooterLine(footerIndex) {
    removeStableStringItem(pageEditor, path, 'footer', 'footerIds', footerIndex)
  }

  return (
    <section className="block-rate-table">
      <EditableText as="h2" label="Rate Table Heading" path={[...path, 'heading']} value={block.heading ?? ''}>
        {block.heading ?? ''}
      </EditableText>

      <div className="block-rate-table-rows">
        {rows.map((row, rowIndex) => (
          <div className="block-rate-table-row" key={row.id ?? rowIndex}>
            <EditableText
              as="span"
              className="block-rate-table-label"
              label={`Row ${rowIndex + 1} Label`}
              path={[...path, 'rows', rowIndex, 'label']}
              value={row.label ?? ''}
            >
              {row.label ?? ''}
            </EditableText>

            <div className="block-rate-table-values">
              {(row.values ?? []).map((value, valueIndex) => (
                <span className="block-rate-table-value" key={row.valueIds?.[valueIndex] ?? valueIndex}>
                  <EditableText
                    as="span"
                    label={`Row ${rowIndex + 1} Value ${valueIndex + 1}`}
                    path={[...path, 'rows', rowIndex, 'values', valueIndex]}
                    value={value}
                  >
                    {value}
                  </EditableText>
                  {controlsVisible ? (
                    <EditorIconButton
                      className="block-inline-command"
                      data-admin-inline-editable="true"
                      icon={Trash2}
                      label={`Remove value ${valueIndex + 1}`}
                      tone="danger"
                      onClick={() => removeValue(rowIndex, valueIndex)}
                    />
                  ) : null}
                </span>
              ))}
              {controlsVisible ? (
                <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add value" onClick={() => addValue(rowIndex)} />
              ) : null}
            </div>

            {controlsVisible ? (
              <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label="Remove row" tone="danger" onClick={() => removeRow(rowIndex)} />
            ) : null}
          </div>
        ))}
      </div>

      {controlsVisible ? (
        <EditorIconButton className="block-rate-table-add-row block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add rate row" onClick={addRow} />
      ) : null}

      <div className="block-rate-table-footer">
        {footer.map((line, footerIndex) => (
          <div className="block-rate-table-footer-row" key={block.footerIds?.[footerIndex] ?? footerIndex}>
            <EditableText as="p" label={`Footer Line ${footerIndex + 1}`} multiline path={[...path, 'footer', footerIndex]} rows={2} value={line}>
              {line}
            </EditableText>
            {controlsVisible ? (
              <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label={`Remove footer line ${footerIndex + 1}`} tone="danger" onClick={() => removeFooterLine(footerIndex)} />
            ) : null}
          </div>
        ))}
        {controlsVisible ? (
          <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add footer line" onClick={addFooterLine} />
        ) : null}
      </div>

      <EditableLink
        allowExternalUrl
        className="block-rate-table-link"
        destination={link.path ?? ''}
        destinationField="path"
        destinationLabel="Link URL"
        destinationPath={[...path, 'link', 'path']}
        external
        link={link}
        linkPath={[...path, 'link']}
        label={link.label ?? ''}
        labelLabel="Link Text"
        labelPath={[...path, 'link', 'label']}
      />
    </section>
  )
}

export function GroupBlockRenderer({ block, context, path }) {
  const pageEditor = usePageEditor()
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const controlsVisible = editable && pageEditor.selectedBlockId === block.id
  const items = Array.isArray(block.items) ? block.items : []
  const nestedContext = { ...context, depth: (context?.depth ?? 0) + 1 }

  function addCard() {
    const newCard = createBlockCollectionItem('group', 'items', { makeId: makeItemId })
    appendPathItem(pageEditor, [...path, 'items'], items, newCard)
    pageEditor?.setSelectedBlockId?.(makeBlockTreeSelectionId('group-item', newCard.id))
  }

  function removeCard(index) {
    if (!window.confirm('Remove this card and all of its content?')) {
      return
    }

    removePathItem(pageEditor, [...path, 'items'], items, index)
    pageEditor?.setSelectedBlockId?.('')
  }

  function moveCard(index, direction) {
    const nextIndex = index + direction

    if (nextIndex < 0 || nextIndex >= items.length) {
      return
    }

    pageEditor?.updatePath([...path, 'items'], arrayMove(items, index, nextIndex))
  }

  return (
    <section className="block-group">
      {items.map((item, index) => {
        const image = item.image ?? { kind: 'image' }
        const imageUrl = getContentImageSrc(image, { height: 900, width: 640 })
        const showMedia = editable || Boolean(imageUrl)
        const cardId = item.id ?? String(index)
        const selectionId = makeBlockTreeSelectionId('group-item', cardId)
        const isCardSelected = editable && pageEditor?.selectedBlockId === selectionId

        return (
          <article
            className={`block-group-card${editable ? ' block-group-card--editable' : ''}${isCardSelected ? ' block-group-card--selected' : ''}`}
            data-editor-selection-id={editable ? selectionId : undefined}
            key={item.id ?? index}
            onClick={editable ? (event) => event.stopPropagation() : undefined}
            onClickCapture={
              editable
                ? (event) => {
                    const target = event.target instanceof Element ? event.target : null
                    const nearestCard = target?.closest('.block-group-card')

                    if (nearestCard === event.currentTarget) {
                      pageEditor?.setSelectedBlockId?.(selectionId)
                    }
                  }
                : undefined
            }
          >
            {isCardSelected ? (
              <div className="block-group-card-toolbar">
                <EditorIconButton
                  data-admin-inline-editable="true"
                  disabled={index === 0}
                  icon={ArrowUp}
                  label="Move card up"
                  onClick={() => moveCard(index, -1)}
                />
                <EditorIconButton
                  data-admin-inline-editable="true"
                  disabled={index === items.length - 1}
                  icon={ArrowDown}
                  label="Move card down"
                  onClick={() => moveCard(index, 1)}
                />
                <EditorIconButton
                  data-admin-inline-editable="true"
                  icon={Trash2}
                  label="Remove card"
                  tone="danger"
                  onClick={() => removeCard(index)}
                />
              </div>
            ) : null}

            <BlockStyleFrame block={item}>
              <div className={`block-group-card-grid${showMedia ? '' : ' block-group-card-grid--no-media'}`}>
                {showMedia ? (
                  <div className="block-group-card-media">
                    <EditableImage
                      alt={getBlockImageAltText(image)}
                      decoding="async"
                      image={image}
                      loading="lazy"
                      path={[...path, 'items', index, 'image']}
                      src={imageUrl}
                    />
                  </div>
                ) : null}

                <div className="block-group-card-content">
                  <EditableText as="h2" label={`Card ${index + 1} Title`} path={[...path, 'items', index, 'title']} value={item.title ?? ''}>
                    {item.title ?? ''}
                  </EditableText>

                  <BlockList
                    blocks={Array.isArray(item.blocks) ? item.blocks : []}
                    context={nestedContext}
                    path={[...path, 'items', index, 'blocks']}
                  />
                </div>
              </div>
            </BlockStyleFrame>
          </article>
        )
      })}

      {controlsVisible ? (
        <EditorIconButton className="block-group-add block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add card" onClick={addCard} />
      ) : null}
    </section>
  )
}

function RowColumn({ column, columnIndex, mobileOrder, nestedContext, path }) {
  const pageEditor = usePageEditor()
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const columnPath = [...path, 'columns', columnIndex]
  const columnWidth = Number(column.width) > 0 ? Number(column.width) : 1
  const selectionId = makeBlockTreeSelectionId('row-column', column.id)
  const isSelected = editable && pageEditor?.selectedBlockId === selectionId

  return (
    <div
      className={`block-row-column${isSelected ? ' block-row-column--selected' : ''}`}
      data-editor-selection-id={editable ? selectionId : undefined}
      style={{ '--block-row-mobile-order': mobileOrder, flexGrow: columnWidth }}
      onClickCapture={
        editable
          ? (event) => {
              const target = event.target instanceof Element ? event.target : null
              const nearestColumn = target?.closest('.block-row-column')

              if (nearestColumn === event.currentTarget) {
                pageEditor?.setSelectedBlockId?.(selectionId)
              }
            }
          : undefined
      }
    >
      <BlockStyleFrame block={column}>
        <BlockList
          blocks={Array.isArray(column.blocks) ? column.blocks : []}
          context={nestedContext}
          emptyMessage="Empty column."
          path={[...columnPath, 'blocks']}
        />
      </BlockStyleFrame>
    </div>
  )
}

export function RowBlockRenderer({ block, context, path }) {
  const columns = Array.isArray(block.columns) ? block.columns : []
  const nestedContext = { ...context, depth: (context?.depth ?? 0) + 1 }
  const mobileColumns = getRowMobileColumnsMode(block)
  const mobileColumnOrder = getRowMobileColumnOrder(block)

  return (
    <div className={`block-row block-row--mobile-${mobileColumns}`}>
      {columns.map((column, columnIndex) => {
        const configuredOrder = mobileColumnOrder.indexOf(String(column?.id ?? ''))

        return (
          <RowColumn
            column={column}
            columnIndex={columnIndex}
            key={column.id ?? columnIndex}
            mobileOrder={configuredOrder >= 0 ? configuredOrder : columnIndex}
            nestedContext={nestedContext}
            path={path}
          />
        )
      })}
    </div>
  )
}

export function RowBlockSettings({ block, path }) {
  const pageEditor = usePageEditor()
  const columns = Array.isArray(block.columns) ? block.columns : []
  const selectedPresetId = getRowLayoutPresetId(columns)

  function applyPreset(presetId) {
    const result = applyRowLayoutPreset(columns, presetId, { makeId: makeItemId })

    if (!result) {
      return
    }

    pageEditor?.updatePath([...path, 'columns'], result.columns)
  }

  return (
    <label className="block-toolbar-setting">
      <span>Layout</span>
      <select data-admin-inline-editable="true" value={selectedPresetId} onChange={(event) => applyPreset(event.target.value)}>
        <option disabled value="">
          Custom
        </option>
        {ROW_LAYOUT_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function TwoColumnTextBlockRenderer({ block, path }) {
  return (
    <section className="block-two-column">
      <EditableRichHtml className="block-two-column-side" html={normalizeSiteHtml(block.left ?? '').trim()} path={[...path, 'left']} title="Left Column" />
      <EditableRichHtml className="block-two-column-side" html={normalizeSiteHtml(block.right ?? '').trim()} path={[...path, 'right']} title="Right Column" />
    </section>
  )
}

export function BusinessListBlockRenderer({ block, path }) {
  const pageEditor = usePageEditor()
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const controlsVisible = editable && pageEditor.selectedBlockId === block.id
  const items = Array.isArray(block.items) ? block.items : []

  function addItem() {
    appendPathItem(pageEditor, [...path, 'items'], items, createBlockCollectionItem('business-list', 'items', { makeId: makeItemId }))
  }

  function removeItem(index) {
    removePathItem(pageEditor, [...path, 'items'], items, index)
  }

  function addPhone(itemIndex) {
    appendStableStringItem(pageEditor, [...path, 'items', itemIndex], 'phones', 'phoneIds')
  }

  function removePhone(itemIndex, phoneIndex) {
    removeStableStringItem(pageEditor, [...path, 'items', itemIndex], 'phones', 'phoneIds', phoneIndex)
  }

  return (
    <section className="block-business-list">
      <EditableText as="h2" label="List Title" multiline path={[...path, 'title']} rows={3} value={block.title ?? ''}>
        {block.title ?? ''}
      </EditableText>

      <div className="block-business-list-items">
        {items.map((item, index) => (
          <div className="block-business-list-item" key={item.id ?? index}>
            {item.website || editable ? (
              <EditableLink
                allowExternalUrl
                className="block-business-list-name"
                destination={item.website ?? ''}
                destinationField="website"
                destinationLabel="Website URL"
                destinationPath={[...path, 'items', index, 'website']}
                external
                link={item}
                linkPath={[...path, 'items', index]}
                label={item.name ?? ''}
                labelLabel="Business Name"
                labelPath={[...path, 'items', index, 'name']}
              />
            ) : (
              <EditableText as="span" className="block-business-list-name" label="Business Name" path={[...path, 'items', index, 'name']} value={item.name ?? ''}>
                {item.name ?? ''}
              </EditableText>
            )}

            <span className="block-business-list-phones">
              {(item.phones ?? []).map((phone, phoneIndex) => (
                <span className="block-business-list-phone" key={item.phoneIds?.[phoneIndex] ?? phoneIndex}>
                  <EditablePhoneText label={`Phone ${phoneIndex + 1}`} path={[...path, 'items', index, 'phones', phoneIndex]} value={phone} />
                  {controlsVisible ? (
                    <EditorIconButton
                      className="block-inline-command"
                      data-admin-inline-editable="true"
                      icon={Trash2}
                      label={`Remove phone ${phoneIndex + 1}`}
                      tone="danger"
                      onClick={() => removePhone(index, phoneIndex)}
                    />
                  ) : null}
                </span>
              ))}
              {controlsVisible ? (
                <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add phone" onClick={() => addPhone(index)} />
              ) : null}
            </span>

            {controlsVisible ? (
              <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label="Remove business" tone="danger" onClick={() => removeItem(index)} />
            ) : null}
          </div>
        ))}
      </div>

      {controlsVisible ? (
        <EditorIconButton className="block-business-list-add block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add business" onClick={addItem} />
      ) : null}
    </section>
  )
}
