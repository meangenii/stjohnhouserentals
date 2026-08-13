import { useEffect, useState } from 'react'
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
import { useBlockElementStyleProps } from '../../lib/blockElementStyles'
import { normalizeSiteHtml } from '../../lib/normalizeSiteHtml'
import { submitPageInquiry } from '../../lib/pageInquiryApi'
import { appendPathItem, removePathItem, usePageEditor } from '../../lib/usePageEditor'
import { useSiteShellContent } from '../../lib/useSiteContent'

function makeItemId() {
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asText(value) {
  return value == null ? '' : String(value)
}

function ElementBox({ as: Component = 'div', block, className = '', style, styleTarget, ...props }) {
  const styleProps = useBlockElementStyleProps(block, styleTarget, { className, style })

  return <Component {...props} {...styleProps} />
}

function ElementEditableText({ block, className = '', style, styleTarget, ...props }) {
  const styleProps = useBlockElementStyleProps(block, styleTarget, { className, style })

  return <EditableText {...props} {...styleProps} />
}

function ElementEditableRichHtml({ block, className = '', style, styleTarget, ...props }) {
  const styleProps = useBlockElementStyleProps(block, styleTarget, { className, style })

  return <EditableRichHtml {...props} {...styleProps} />
}

function ElementEditableImage({ block, className = '', style, styleTarget, ...props }) {
  const styleProps = useBlockElementStyleProps(block, styleTarget, { className, style })

  return <EditableImage {...props} {...styleProps} />
}

function ElementEditableLink({ block, className = '', style, styleTarget, ...props }) {
  const styleProps = useBlockElementStyleProps(block, styleTarget, { className, style })

  return <EditableLink {...props} {...styleProps} />
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

  return <ElementEditableRichHtml block={block} className="block-rich-text" html={html} path={[...path, 'html']} styleTarget="text" title="Block Text" />
}

export function ImageBlockRenderer({ block, path }) {
  const image = block.image ?? { kind: 'image' }
  const imageUrl = getContentImageSrc(image, { width: 1200 })

  return (
    <ElementBox as="figure" block={block} className="block-image" styleTarget="figure">
      <ElementEditableImage
        alt={getBlockImageAltText(image)}
        block={block}
        className="block-image-photo"
        decoding="async"
        image={image}
        loading="lazy"
        path={[...path, 'image']}
        src={imageUrl}
        styleTarget="image"
      />
      <ElementEditableText
        as="figcaption"
        block={block}
        className="block-image-caption"
        label="Caption"
        multiline
        path={[...path, 'caption']}
        rows={2}
        styleTarget="caption"
        value={block.caption ?? ''}
      >
        {block.caption ?? ''}
      </ElementEditableText>
    </ElementBox>
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
    <ElementBox aria-label="Image gallery" as="section" block={block} className="block-image-gallery" styleTarget="grid">
      {images.map((image, index) => (
        <ElementBox as="figure" block={block} className="block-image-gallery-item" key={image?.id ?? index} styleTarget="item">
          <ElementEditableImage
            alt={getBlockImageAltText(image)}
            block={block}
            className="block-image-gallery-image"
            decoding="async"
            image={image}
            loading="lazy"
            path={[...path, 'images', index]}
            src={getContentImageSrc(image, { height: 720, width: 960 })}
            styleTarget="image"
          />
          {String(image?.title ?? '').trim() ? (
            <ElementEditableText
              as="figcaption"
              block={block}
              className="block-image-gallery-caption"
              label={`Image ${index + 1} Title`}
              path={[...path, 'images', index, 'title']}
              styleTarget="caption"
              value={image?.title ?? ''}
            >
              {image?.title ?? ''}
            </ElementEditableText>
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
        </ElementBox>
      ))}
      {controlsVisible ? (
        <EditorIconButton className="block-image-gallery-add block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add image" onClick={addImage} />
      ) : null}
    </ElementBox>
  )
}

export function CtaBandBlockRenderer({ block, path }) {
  const action = block.action ?? {}

  return (
    <section className="block-cta-band">
      <ElementBox block={block} className="block-cta-band-inner" styleTarget="content">
        <ElementEditableText as="h2" block={block} label="CTA Title" multiline path={[...path, 'title']} rows={3} styleTarget="title" value={block.title ?? ''}>
          {block.title ?? ''}
        </ElementEditableText>
        <ElementEditableText as="p" block={block} label="CTA Body" multiline path={[...path, 'body']} rows={4} styleTarget="body" value={block.body ?? ''}>
          {block.body ?? ''}
        </ElementEditableText>
        <ElementEditableLink
          allowExternalUrl
          allowRouteSelection
          block={block}
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
          styleTarget="action"
        />
      </ElementBox>
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
  // Older hero blocks predate the enabled toggle: a real label + path already means the
  // admin configured the button, so only an explicit `enabled: false` hides it for them.
  const hasCtaProperties = String(action.label ?? '').trim() !== '' && String(action.path ?? '').trim() !== ''
  const showCtaButton = hasCtaProperties && action.enabled !== false

  return (
    <EditableBackgroundSection
      as="section"
      className="block-hero"
      image={image}
      path={[...path, 'image']}
      style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
    >
      <ElementBox block={block} className="block-hero-inner" styleTarget="content">
        <ElementEditableText as="h1" block={block} label="Hero Title" multiline path={[...path, 'title']} rows={3} styleTarget="title" value={block.title ?? ''}>
          {block.title ?? ''}
        </ElementEditableText>
        <ElementEditableText as="p" block={block} label="Hero Lead" multiline path={[...path, 'lead']} rows={3} styleTarget="lead" value={block.lead ?? ''}>
          {block.lead ?? ''}
        </ElementEditableText>
        {showCtaButton ? (
          <ElementEditableLink
            allowExternalUrl
            allowRouteSelection
            block={block}
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
            styleTarget="action"
          />
        ) : null}
      </ElementBox>
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
        <ElementBox block={block} className="block-split-media" styleTarget="media">
          <ElementEditableImage
            alt={getBlockImageAltText(image)}
            block={block}
            className="block-split-image"
            decoding="async"
            image={image}
            loading="lazy"
            path={[...path, 'image']}
            src={imageUrl}
            styleTarget="image"
          />
        </ElementBox>
        <ElementBox block={block} className="block-split-copy" styleTarget="copy">
          <ElementEditableText as="p" block={block} className="block-split-kicker" label="Kicker" path={[...path, 'kicker']} styleTarget="kicker" value={block.kicker ?? ''}>
            {block.kicker ?? ''}
          </ElementEditableText>
          <ElementEditableText as="h2" block={block} label="Title" multiline path={[...path, 'title']} rows={3} styleTarget="title" value={block.title ?? ''}>
            {block.title ?? ''}
          </ElementEditableText>
          <ElementEditableRichHtml block={block} className="block-split-body" html={normalizeSiteHtml(block.body ?? '').trim()} path={[...path, 'body']} styleTarget="body" title="Body Text" />
          <ElementEditableLink
            allowExternalUrl
            allowRouteSelection
            block={block}
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
            styleTarget="action"
          />
        </ElementBox>
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
      <ElementEditableText as="h2" block={block} label="Feature Grid Title" multiline path={[...path, 'title']} rows={3} styleTarget="title" value={block.title ?? ''}>
        {block.title ?? ''}
      </ElementEditableText>

      <ElementBox block={block} className="block-feature-grid-items" styleTarget="items">
        {items.map((item, index) => (
          <ElementBox as="article" block={block} className="block-feature-grid-item" key={item.id ?? index} styleTarget="item">
            <ElementBox block={block} className="block-feature-grid-icon" styleTarget="itemIcon">
              <BlockFeatureIcon kind={item.kind} />
            </ElementBox>
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
            <ElementEditableText
              as="h3"
              block={block}
              label={`Feature ${index + 1} Title`}
              path={[...path, 'items', index, 'title']}
              styleTarget="itemTitle"
              value={item.title ?? ''}
            >
              {item.title ?? ''}
            </ElementEditableText>
            <ElementEditableText
              as="p"
              block={block}
              label={`Feature ${index + 1} Description`}
              multiline
              path={[...path, 'items', index, 'body']}
              rows={4}
              styleTarget="itemBody"
              value={item.body ?? ''}
            >
              {item.body ?? ''}
            </ElementEditableText>
            {controlsVisible ? (
              <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label="Remove feature" tone="danger" onClick={() => removeItem(index)} />
            ) : null}
          </ElementBox>
        ))}
      </ElementBox>

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
      <ElementBox block={block} className="block-testimonials-grid" styleTarget="grid">
        {items.map((item, index) => (
          <ElementBox as="figure" block={block} className="block-testimonials-item" key={item.id ?? index} styleTarget="item">
            <ElementEditableText
              as="blockquote"
              block={block}
              label={`Testimonial ${index + 1} Quote`}
              multiline
              path={[...path, 'items', index, 'quote']}
              rows={4}
              styleTarget="quote"
              value={item.quote ?? ''}
            >
              {item.quote ?? ''}
            </ElementEditableText>
            <ElementEditableText
              as="figcaption"
              block={block}
              label={`Testimonial ${index + 1} Author`}
              path={[...path, 'items', index, 'author']}
              styleTarget="author"
              value={item.author ?? ''}
            >
              {item.author ?? ''}
            </ElementEditableText>
            {controlsVisible ? (
              <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label="Remove testimonial" tone="danger" onClick={() => removeItem(index)} />
            ) : null}
          </ElementBox>
        ))}
      </ElementBox>

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
      <ElementBox block={block} className="block-contact-form-inner" styleTarget="content">
        <ElementEditableText as="h2" block={block} label="Form Title" multiline path={[...path, 'title']} rows={3} styleTarget="title" value={block.title ?? ''}>
          {block.title ?? ''}
        </ElementEditableText>
        <ElementEditableText as="p" block={block} label="Form Intro" multiline path={[...path, 'intro']} rows={4} styleTarget="intro" value={block.intro ?? ''}>
          {block.intro ?? ''}
        </ElementEditableText>

        <ElementBox as="form" block={block} className="block-contact-form-fields" data-admin-inline-editable="true" styleTarget="form" onSubmit={handleSubmit}>
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

          <ElementBox
            as="button"
            block={block}
            className="button-link button-link--primary block-contact-form-submit"
            disabled={editable || submitStatus === 'submitting'}
            styleTarget="submit"
            type="submit"
          >
            {submitStatus === 'submitting' ? 'Sending...' : 'Send Message'}
          </ElementBox>

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
        </ElementBox>
      </ElementBox>
    </section>
  )
}

export function DirectoryEmbedBlockRenderer({ block, path }) {
  const pageEditor = usePageEditor()
  const source = block.source === 'charters' ? 'charters' : 'properties'
  const hasTitleText = Boolean(String(block.title ?? '').trim())

  const titleNode =
    pageEditor || hasTitleText ? (
      <ElementEditableText as="span" block={block} label="Directory Title" path={[...path, 'title']} styleTarget="title" value={block.title ?? ''}>
        {block.title ?? ''}
      </ElementEditableText>
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
      {items.map((item, index) => (
        <ElementBox block={block} className="block-contact-details-row" key={item.id ?? index} styleTarget="item">
          <ElementEditableText
            as="span"
            block={block}
            className="block-contact-details-label"
            label={`Detail ${index + 1} Label`}
            path={[...path, 'items', index, 'label']}
            styleTarget="label"
            value={item.label ?? ''}
          >
            {item.label ?? ''}
          </ElementEditableText>
          {item.type === 'link' ? (
            <ElementEditableLink
              allowExternalUrl
              block={block}
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
              styleTarget="value"
            />
          ) : item.type === 'phone' ? (
            <ElementBox as="span" block={block} className="block-contact-details-value" styleTarget="value">
              <EditablePhoneText label={`Detail ${index + 1} Value`} path={[...path, 'items', index, 'value']} value={item.value ?? ''} />
            </ElementBox>
          ) : (
            <ElementEditableText
              as="span"
              block={block}
              className="block-contact-details-value"
              label={`Detail ${index + 1} Value`}
              path={[...path, 'items', index, 'value']}
              styleTarget="value"
              value={item.value ?? ''}
            >
              {item.value ?? ''}
            </ElementEditableText>
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
              <EditorIconButton
                className="block-inline-command"
                data-admin-inline-editable="true"
                icon={Trash2}
                label={`Remove detail ${index + 1}`}
                tone="danger"
                onClick={() => removeItem(index)}
              />
            </>
          ) : null}
        </ElementBox>
      ))}
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
      <ElementEditableText as="h2" block={block} label="Schedule Title" path={[...path, 'title']} styleTarget="title" value={block.title ?? ''}>
        {block.title ?? ''}
      </ElementEditableText>

      <ElementBox block={block} className="block-schedule-columns" styleTarget="columns">
        {columns.map((column, columnIndex) => (
          <ElementBox block={block} className="block-schedule-column" key={column.id ?? columnIndex} styleTarget="column">
            <ElementEditableText
              as="h3"
              block={block}
              label={`Column ${columnIndex + 1} Heading`}
              path={[...path, 'columns', columnIndex, 'heading']}
              styleTarget="columnHeading"
              value={column.heading ?? ''}
            >
              {column.heading ?? ''}
            </ElementEditableText>

            <div className="block-schedule-time-list">
              {(column.times ?? []).map((time, timeIndex) => (
                <div className="block-schedule-time-row" key={column.timeIds?.[timeIndex] ?? timeIndex}>
                  <ElementEditableText
                    as="span"
                    block={block}
                    className="block-schedule-time-value"
                    label={`Column ${columnIndex + 1} Time ${timeIndex + 1}`}
                    path={[...path, 'columns', columnIndex, 'times', timeIndex]}
                    styleTarget="time"
                    value={time}
                  >
                    {time}
                  </ElementEditableText>
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
          </ElementBox>
        ))}
      </ElementBox>

      {controlsVisible ? (
        <EditorIconButton className="block-schedule-add-column block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add column" onClick={addColumn} />
      ) : null}

      <ElementBox block={block} className="block-schedule-notes" styleTarget="notes">
        {notes.map((note, noteIndex) => (
          <div className="block-schedule-note-row" key={block.noteIds?.[noteIndex] ?? noteIndex}>
            <ElementEditableText as="p" block={block} label={`Note ${noteIndex + 1}`} multiline path={[...path, 'notes', noteIndex]} rows={2} styleTarget="note" value={note}>
              {note}
            </ElementEditableText>
            {controlsVisible ? (
              <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label={`Remove note ${noteIndex + 1}`} tone="danger" onClick={() => removeNote(noteIndex)} />
            ) : null}
          </div>
        ))}
        {controlsVisible ? (
          <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add note" onClick={addNote} />
        ) : null}
      </ElementBox>
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
      <ElementEditableText as="h2" block={block} label="Rate Table Heading" path={[...path, 'heading']} styleTarget="heading" value={block.heading ?? ''}>
        {block.heading ?? ''}
      </ElementEditableText>

      <ElementBox block={block} className="block-rate-table-rows" styleTarget="rows">
        {rows.map((row, rowIndex) => (
          <ElementBox block={block} className="block-rate-table-row" key={row.id ?? rowIndex} styleTarget="row">
            <ElementEditableText
              as="span"
              block={block}
              className="block-rate-table-label"
              label={`Row ${rowIndex + 1} Label`}
              path={[...path, 'rows', rowIndex, 'label']}
              styleTarget="rowLabel"
              value={row.label ?? ''}
            >
              {row.label ?? ''}
            </ElementEditableText>

            <div className="block-rate-table-values">
              {(row.values ?? []).map((value, valueIndex) => (
                <span className="block-rate-table-value" key={row.valueIds?.[valueIndex] ?? valueIndex}>
                  <ElementEditableText
                    as="span"
                    block={block}
                    label={`Row ${rowIndex + 1} Value ${valueIndex + 1}`}
                    path={[...path, 'rows', rowIndex, 'values', valueIndex]}
                    styleTarget="rowValue"
                    value={value}
                  >
                    {value}
                  </ElementEditableText>
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
          </ElementBox>
        ))}
      </ElementBox>

      {controlsVisible ? (
        <EditorIconButton className="block-rate-table-add-row block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add rate row" onClick={addRow} />
      ) : null}

      <ElementBox block={block} className="block-rate-table-footer" styleTarget="footer">
        {footer.map((line, footerIndex) => (
          <div className="block-rate-table-footer-row" key={block.footerIds?.[footerIndex] ?? footerIndex}>
            <ElementEditableText
              as="p"
              block={block}
              label={`Footer Line ${footerIndex + 1}`}
              multiline
              path={[...path, 'footer', footerIndex]}
              rows={2}
              styleTarget="footerLine"
              value={line}
            >
              {line}
            </ElementEditableText>
            {controlsVisible ? (
              <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label={`Remove footer line ${footerIndex + 1}`} tone="danger" onClick={() => removeFooterLine(footerIndex)} />
            ) : null}
          </div>
        ))}
        {controlsVisible ? (
          <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add footer line" onClick={addFooterLine} />
        ) : null}
      </ElementBox>

      <ElementEditableLink
        allowExternalUrl
        block={block}
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
        styleTarget="link"
      />
    </section>
  )
}

const CAR_BARGE_HERO_BOTTOM_PEEK_FALLBACK_PX = 105

function getCarBargeStickySelectionOffset() {
  const pillNavElement = document.querySelector('.block-car-barge-hero-pills')

  return pillNavElement ? pillNavElement.getBoundingClientRect().height + 32 : Math.round(window.innerHeight * 0.24)
}

function useCarBargeScrollSpy(ids, defaultId) {
  const [activeId, setActiveId] = useState(defaultId)
  const idsKey = ids.join('|')

  useEffect(() => {
    if (!idsKey) {
      return undefined
    }

    let frameId = 0
    const sectionIds = idsKey.split('|').filter(Boolean)

    function updateActiveSection() {
      frameId = 0

      const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean)

      if (!sections.length) {
        setActiveId(defaultId)
        return
      }

      const selectionY = window.scrollY + getCarBargeStickySelectionOffset()
      const activeSection = sections.reduce((currentActive, section) => {
        const sectionTop = section.getBoundingClientRect().top + window.scrollY

        return sectionTop <= selectionY ? section : currentActive
      }, sections[0])

      setActiveId((currentActiveId) => (currentActiveId === activeSection.id ? currentActiveId : activeSection.id))
    }

    function scheduleActiveSectionUpdate() {
      if (frameId) {
        return
      }

      frameId = window.requestAnimationFrame(updateActiveSection)
    }

    scheduleActiveSectionUpdate()
    window.addEventListener('scroll', scheduleActiveSectionUpdate, { passive: true })
    window.addEventListener('resize', scheduleActiveSectionUpdate)

    return () => {
      window.removeEventListener('scroll', scheduleActiveSectionUpdate)
      window.removeEventListener('resize', scheduleActiveSectionUpdate)
      window.cancelAnimationFrame(frameId)
    }
  }, [defaultId, idsKey])

  return activeId
}

function getCarBargeHeroBottomPeek(pillNavElement) {
  const pillNavMarginTop = pillNavElement
    ? Number.parseFloat(window.getComputedStyle(pillNavElement).marginTop)
    : Number.NaN

  return Number.isFinite(pillNavMarginTop) && pillNavMarginTop < 0
    ? Math.abs(pillNavMarginTop)
    : CAR_BARGE_HERO_BOTTOM_PEEK_FALLBACK_PX
}

function getCarBargeScrollBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function scrollToCarBargeHeroBottom() {
  const heroElement = document.querySelector('.block-car-barge-hero')
  const pillNavElement = document.querySelector('.block-car-barge-hero-pills')

  if (!heroElement) {
    return
  }

  const heroBottom = heroElement.getBoundingClientRect().bottom + window.scrollY
  const targetTop = Math.max(0, Math.round(heroBottom - getCarBargeHeroBottomPeek(pillNavElement)))

  window.scrollTo({
    top: targetTop,
    left: 0,
    behavior: getCarBargeScrollBehavior(),
  })
}

function scrollToCarBargeSection(sectionId) {
  if (sectionId === 'cbtest-general-info' || sectionId === 'general-info') {
    scrollToCarBargeHeroBottom()
    return
  }

  const targetElement = document.getElementById(sectionId)

  if (!targetElement) {
    return
  }

  const pillNavElement = document.querySelector('.block-car-barge-hero-pills')
  const stickyOffset = pillNavElement ? pillNavElement.getBoundingClientRect().height + 16 : 24
  const targetTop = Math.max(0, Math.round(targetElement.getBoundingClientRect().top + window.scrollY - stickyOffset))

  window.scrollTo({
    top: targetTop,
    left: 0,
    behavior: getCarBargeScrollBehavior(),
  })
}

function handleCarBargeQuickNavClick(event, sectionId) {
  event.preventDefault()
  scrollToCarBargeSection(sectionId)
}

export function CarBargeHeroBlockRenderer({ block, path }) {
  const image = asObject(block.image)
  const navItems = asArray(block.navItems)
  const heroImageUrl = getContentImageSrc(image, { height: 720, width: 1920 })
  const activeSectionId = useCarBargeScrollSpy(
    navItems.map((item) => asText(asObject(item).targetId)).filter(Boolean),
    asText(asObject(navItems[0]).targetId),
  )

  return (
    <>
      <section className="block-car-barge-hero">
        <div className="block-car-barge-hero-media">
          <div className="block-car-barge-hero-image-crop">
            {heroImageUrl ? (
              <ElementEditableImage
                alt={getBlockImageAltText(image) || asText(block.title)}
                block={block}
                decoding="async"
                fetchPriority="high"
                image={image}
                path={[...path, 'image']}
                src={heroImageUrl}
                styleTarget="image"
              />
            ) : null}
          </div>
        </div>
        <ElementBox block={block} className="block-car-barge-hero-overlay" styleTarget="title">
          <ElementEditableText
            as="h1"
            block={block}
            className="block-car-barge-hero-title"
            label="Hero title"
            multiline
            path={[...path, 'title']}
            rows={3}
            styleTarget="title"
            value={asText(block.title)}
          >
            {asText(block.title)}
          </ElementEditableText>
        </ElementBox>
      </section>

      {navItems.length > 0 ? (
        <ElementBox as="nav" aria-label="Jump to section" block={block} className="block-car-barge-hero-pills" styleTarget="nav">
          {navItems.map((item, itemIndex) => {
            const navItem = asObject(item)
            const targetId = asText(navItem.targetId)
            const label = asText(navItem.label)

            return (
              <a
                className={`block-car-barge-hero-pill${targetId && targetId === activeSectionId ? ' is-active' : ''}`}
                href={targetId ? `#${targetId}` : '#'}
                key={navItem.id ?? itemIndex}
                onClick={(event) => handleCarBargeQuickNavClick(event, targetId)}
              >
                <ElementEditableText
                  as="span"
                  block={block}
                  label={`Nav item ${itemIndex + 1}`}
                  path={[...path, 'navItems', itemIndex, 'label']}
                  styleTarget="nav"
                  value={label}
                >
                  {label}
                </ElementEditableText>
              </a>
            )
          })}
        </ElementBox>
      ) : null}
    </>
  )
}

export function CarBargeIntroBlockRenderer({ block, path }) {
  const leftParagraphs = asArray(block.leftParagraphs)
  const rightParagraphs = asArray(block.rightParagraphs)
  const portAuthorityFees = asArray(block.portAuthorityFees).filter((fee) => {
    const feeRecord = asObject(fee)
    return asText(feeRecord.label).replace(/<br\s*\/?>/gi, '').trim() || asText(feeRecord.value).replace(/<br\s*\/?>/gi, '').trim()
  })
  const referenceLink = asObject(block.referenceLink)
  const referenceHref = asText(referenceLink.path || referenceLink.href)
  const referenceLabel = asText(referenceLink.label) || (referenceHref ? 'Link for information is here.' : '')

  return (
    <section className="block-car-barge-intro">
      <div className="block-car-barge-intro-grid">
        <div className="block-car-barge-intro-copy">
          {leftParagraphs.map((paragraph, paragraphIndex) => (
            <ElementEditableText
              as="p"
              block={block}
              key={block.leftParagraphIds?.[paragraphIndex] ?? paragraphIndex}
              label={`Left paragraph ${paragraphIndex + 1}`}
              multiline
              path={[...path, 'leftParagraphs', paragraphIndex]}
              rows={5}
              styleTarget="left"
              value={asText(paragraph)}
            >
              {asText(paragraph)}
            </ElementEditableText>
          ))}

          {portAuthorityFees.length > 0 ? (
            <ElementBox block={block} className="block-car-barge-fee-list" styleTarget="fees">
              {portAuthorityFees.map((fee, feeIndex) => {
                const feeRecord = asObject(fee)

                return (
                  <div className="block-car-barge-fee-row" key={feeRecord.id ?? feeIndex}>
                    <ElementEditableText as="span" block={block} label="Port fee label" path={[...path, 'portAuthorityFees', feeIndex, 'label']} styleTarget="fees" value={asText(feeRecord.label)}>
                      {asText(feeRecord.label)}
                    </ElementEditableText>
                    <ElementEditableText as="span" block={block} label="Port fee value" path={[...path, 'portAuthorityFees', feeIndex, 'value']} styleTarget="fees" value={asText(feeRecord.value)}>
                      {asText(feeRecord.value)}
                    </ElementEditableText>
                  </div>
                )
              })}
            </ElementBox>
          ) : null}
        </div>

        <div className="block-car-barge-intro-copy">
          {rightParagraphs.map((paragraph, paragraphIndex) => (
            <ElementEditableText
              as="p"
              block={block}
              key={block.rightParagraphIds?.[paragraphIndex] ?? paragraphIndex}
              label={`Right paragraph ${paragraphIndex + 1}`}
              multiline
              path={[...path, 'rightParagraphs', paragraphIndex]}
              rows={5}
              styleTarget="right"
              value={asText(paragraph)}
            >
              {asText(paragraph)}
            </ElementEditableText>
          ))}

          {referenceHref || referenceLabel ? (
            <p>
              VI Now has more information.{' '}
              <ElementEditableLink
                allowExternalUrl
                block={block}
                className="block-car-barge-inline-link"
                destination={referenceHref}
                destinationField="path"
                destinationLabel="Reference link"
                destinationPath={[...path, 'referenceLink', 'path']}
                external
                link={referenceLink}
                linkPath={[...path, 'referenceLink']}
                label={referenceLabel}
                labelLabel="Reference label"
                labelPath={[...path, 'referenceLink', 'label']}
                styleTarget="right"
              />
            </p>
          ) : null}
        </div>
      </div>

      {asText(block.note) ? (
        <ElementBox as="section" block={block} className="block-car-barge-note" styleTarget="note">
          <ElementEditableText
            as="p"
            block={block}
            label="Page note"
            multiline
            path={[...path, 'note']}
            rows={4}
            styleTarget="note"
            value={asText(block.note)}
          >
            {asText(block.note)}
          </ElementEditableText>
        </ElementBox>
      ) : null}
    </section>
  )
}

function getCarBargeScheduleTabLabel(title, index) {
  const scheduleTitle = asText(title).trim()

  if (/monday\W*friday|weekday/i.test(scheduleTitle)) {
    return 'Weekdays'
  }

  if (/saturday|sunday|weekend|holiday/i.test(scheduleTitle)) {
    return 'Weekend'
  }

  if (/monday\W*sunday|daily|every\s+day/i.test(scheduleTitle)) {
    return 'Daily'
  }

  return scheduleTitle || `Schedule ${index + 1}`
}

function CarBargeSchedulePanel({ block, operatorPath, schedule, scheduleIndex }) {
  const scheduleRecord = asObject(schedule)
  const columns = asArray(scheduleRecord.columns)
  const notes = asArray(scheduleRecord.notes)
  const schedulePath = [...operatorPath, 'schedules', scheduleIndex]

  return (
    <section className="block-car-barge-schedule">
      <ElementEditableText
        as="h3"
        block={block}
        label="Schedule title"
        path={[...schedulePath, 'title']}
        styleTarget="schedule"
        value={asText(scheduleRecord.title)}
      >
        {asText(scheduleRecord.title)}
      </ElementEditableText>

      <div className="block-car-barge-schedule-columns">
        {columns.map((column, columnIndex) => {
          const columnRecord = asObject(column)
          const columnPath = [...schedulePath, 'columns', columnIndex]
          const times = asArray(columnRecord.times)

          return (
            <div className="block-car-barge-schedule-column" key={columnRecord.id ?? columnIndex}>
              <ElementEditableText
                as="h4"
                block={block}
                label="Schedule column heading"
                path={[...columnPath, 'heading']}
                styleTarget="schedule"
                value={asText(columnRecord.heading)}
              >
                {asText(columnRecord.heading)}
              </ElementEditableText>

              <div className="block-car-barge-time-list">
                {times.map((time, timeIndex) => (
                  <ElementEditableText
                    as="p"
                    block={block}
                    className="block-car-barge-time-entry"
                    key={columnRecord.timeIds?.[timeIndex] ?? timeIndex}
                    label={`Schedule time ${timeIndex + 1}`}
                    path={[...columnPath, 'times', timeIndex]}
                    styleTarget="schedule"
                    value={asText(time)}
                  >
                    {asText(time)}
                  </ElementEditableText>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {notes.length > 0 ? (
        <div className="block-car-barge-schedule-notes">
          {notes.map((note, noteIndex) => (
            <ElementEditableText
              as="p"
              block={block}
              key={scheduleRecord.noteIds?.[noteIndex] ?? noteIndex}
              label={`Schedule note ${noteIndex + 1}`}
              path={[...schedulePath, 'notes', noteIndex]}
              styleTarget="schedule"
              value={asText(note)}
            >
              {asText(note)}
            </ElementEditableText>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function CarBargeRatesStrip({ block, path }) {
  const rates = asObject(block.rates)
  const rows = asArray(rates.rows)
  const footer = asArray(rates.footer)
  const link = asObject(rates.link)
  const isStacked = asText(rates.layout) === 'stacked'

  if (!rows.length && !footer.length && !asText(link.path)) {
    return null
  }

  return (
    <section className={`block-car-barge-rates${isStacked ? ' block-car-barge-rates--stacked' : ''}`} aria-label={asText(rates.heading) || 'Car barge rates'}>
      <div className="block-car-barge-rates-copy">
        {rows.map((row, rowIndex) => {
          const rowRecord = asObject(row)
          const values = asArray(rowRecord.values)

          return (
            <div className={`block-car-barge-rates-row${asText(rowRecord.label) ? '' : ' is-values-only'}`} key={rowRecord.id ?? rowIndex}>
              {asText(rowRecord.label) ? (
                <ElementEditableText
                  as="span"
                  block={block}
                  className="block-car-barge-rates-row-label"
                  label="Rate label"
                  path={[...path, 'rates', 'rows', rowIndex, 'label']}
                  styleTarget="rates"
                  value={asText(rowRecord.label)}
                >
                  {asText(rowRecord.label)}
                </ElementEditableText>
              ) : null}

              <div className="block-car-barge-rates-row-values">
                {values.map((value, valueIndex) => (
                  <ElementEditableText
                    as="span"
                    block={block}
                    key={rowRecord.valueIds?.[valueIndex] ?? valueIndex}
                    label="Rate value"
                    path={[...path, 'rates', 'rows', rowIndex, 'values', valueIndex]}
                    styleTarget="rates"
                    value={asText(value)}
                  >
                    {asText(value)}
                  </ElementEditableText>
                ))}
              </div>
            </div>
          )
        })}

        <div className="block-car-barge-rates-footer">
          {footer.map((line, footerIndex) => (
            <ElementEditableText
              as="p"
              block={block}
              key={rates.footerIds?.[footerIndex] ?? footerIndex}
              label="Rates footer"
              path={[...path, 'rates', 'footer', footerIndex]}
              styleTarget="rates"
              value={asText(line)}
            >
              {asText(line)}
            </ElementEditableText>
          ))}

          {asText(link.path) || asText(link.label) ? (
            <ElementEditableLink
              allowExternalUrl
              block={block}
              className="block-car-barge-rates-link"
              destination={asText(link.path)}
              destinationField="path"
              destinationLabel="Rates website URL"
              destinationPath={[...path, 'rates', 'link', 'path']}
              external
              link={link}
              linkPath={[...path, 'rates', 'link']}
              label={asText(link.label) || 'Visit operator website'}
              labelLabel="Rates website link text"
              labelPath={[...path, 'rates', 'link', 'label']}
              styleTarget="rates"
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function CarBargeOperatorBlockRenderer({ block, path }) {
  const [activeScheduleIndex, setActiveScheduleIndex] = useState(0)
  const schedules = asArray(block.schedules)
  const selectedScheduleIndex = activeScheduleIndex >= 0 && activeScheduleIndex < schedules.length ? activeScheduleIndex : 0
  const selectedSchedule = schedules[selectedScheduleIndex]
  const image = asObject(block.image)
  const imageUrl = getContentImageSrc(image, { height: 1240, width: 820 })
  const meta = asObject(block.meta)

  return (
    <section className="block-car-barge-operator">
      <div className="block-car-barge-operator-header">
        <ElementEditableText as="h2" block={block} label="Operator title" path={[...path, 'title']} styleTarget="title" value={asText(block.title)}>
          {asText(block.title)}
        </ElementEditableText>

        <ElementBox as="dl" block={block} className="block-car-barge-operator-meta" styleTarget="meta">
          <div className="block-car-barge-operator-meta-card">
            <dt>Barge Names</dt>
            <dd>
              <ElementEditableText as="span" block={block} label="Barge names" path={[...path, 'meta', 'names']} styleTarget="meta" value={asText(meta.names)}>
                {asText(meta.names)}
              </ElementEditableText>
            </dd>
          </div>
          <div className="block-car-barge-operator-meta-card">
            <dt>Telephone</dt>
            <dd>
              <EditablePhoneText label="Operator phone" path={[...path, 'meta', 'phone']} value={asText(meta.phone)} />
            </dd>
          </div>
          <div className="block-car-barge-operator-meta-card">
            <dt>Travel Time</dt>
            <dd>
              <ElementEditableText as="span" block={block} label="Travel time" path={[...path, 'meta', 'travelTime']} styleTarget="meta" value={asText(meta.travelTime)}>
                {asText(meta.travelTime)}
              </ElementEditableText>
            </dd>
          </div>
        </ElementBox>

        <CarBargeRatesStrip block={block} path={path} />
      </div>

      <div className="block-car-barge-operator-grid">
        <ElementBox block={block} className="block-car-barge-operator-media" styleTarget="image">
          {imageUrl ? (
            <ElementEditableImage
              alt={getBlockImageAltText(image) || asText(block.title)}
              block={block}
              decoding="async"
              image={image}
              loading="lazy"
              path={[...path, 'image']}
              src={imageUrl}
              styleTarget="image"
            />
          ) : null}
        </ElementBox>

        <div className="block-car-barge-operator-content">
          {schedules.length > 1 ? (
            <ElementBox as="div" block={block} className="block-car-barge-schedule-tab-list" role="tablist" styleTarget="tabs">
              {schedules.map((schedule, scheduleIndex) => {
                const isSelected = scheduleIndex === selectedScheduleIndex

                return (
                  <button
                    aria-selected={isSelected}
                    className={`block-car-barge-schedule-tab${isSelected ? ' is-active' : ''}`}
                    data-admin-inline-editable="true"
                    key={asObject(schedule).id ?? scheduleIndex}
                    role="tab"
                    type="button"
                    onClick={() => setActiveScheduleIndex(scheduleIndex)}
                  >
                    {getCarBargeScheduleTabLabel(asObject(schedule).title, scheduleIndex)}
                  </button>
                )
              })}
            </ElementBox>
          ) : null}

          {selectedSchedule ? (
            <CarBargeSchedulePanel block={block} operatorPath={path} schedule={selectedSchedule} scheduleIndex={selectedScheduleIndex} />
          ) : null}
        </div>
      </div>
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
              <ElementBox block={block} className={`block-group-card-grid${showMedia ? '' : ' block-group-card-grid--no-media'}`} styleTarget="cardGrid">
                {showMedia ? (
                  <ElementBox block={block} className="block-group-card-media" styleTarget="cardMedia">
                    <EditableImage
                      alt={getBlockImageAltText(image)}
                      decoding="async"
                      image={image}
                      loading="lazy"
                      path={[...path, 'items', index, 'image']}
                      src={imageUrl}
                    />
                  </ElementBox>
                ) : null}

                <ElementBox block={block} className="block-group-card-content" styleTarget="cardContent">
                  <ElementEditableText as="h2" block={block} label={`Card ${index + 1} Title`} path={[...path, 'items', index, 'title']} styleTarget="cardTitle" value={item.title ?? ''}>
                    {item.title ?? ''}
                  </ElementEditableText>

                  <BlockList
                    blocks={Array.isArray(item.blocks) ? item.blocks : []}
                    context={nestedContext}
                    path={[...path, 'items', index, 'blocks']}
                  />
                </ElementBox>
              </ElementBox>
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

function getTabId(blockId, itemId) {
  return `${blockId || 'tabs'}-${itemId || 'item'}-tab`
}

function getTabPanelId(blockId, itemId) {
  return `${blockId || 'tabs'}-${itemId || 'item'}-panel`
}

function getNextTabIndex(key, currentIndex, itemCount) {
  if (key === 'Home') {
    return 0
  }

  if (key === 'End') {
    return itemCount - 1
  }

  if (key === 'ArrowRight') {
    return (currentIndex + 1) % itemCount
  }

  if (key === 'ArrowLeft') {
    return (currentIndex - 1 + itemCount) % itemCount
  }

  return currentIndex
}

export function TabsBlockRenderer({ block, context, path }) {
  const items = asArray(block.items).map(asObject)
  const [activeIndex, setActiveIndex] = useState(0)
  const selectedIndex = activeIndex >= 0 && activeIndex < items.length ? activeIndex : 0
  const selectedItem = items[selectedIndex]
  const nestedContext = { ...context, depth: (context?.depth ?? 0) + 1 }

  if (!items.length) {
    return null
  }

  function handleTabKeyDown(event, itemIndex) {
    const nextIndex = getNextTabIndex(event.key, itemIndex, items.length)

    if (nextIndex === itemIndex) {
      return
    }

    event.preventDefault()
    setActiveIndex(nextIndex)
    window.requestAnimationFrame(() => {
      document.getElementById(getTabId(block.id, items[nextIndex]?.id ?? nextIndex))?.focus()
    })
  }

  return (
    <section className="block-tabs">
      <ElementBox as="div" block={block} className="block-tabs-list" role="tablist" styleTarget="tabList">
        {items.map((item, itemIndex) => {
          const itemId = item.id ?? itemIndex
          const isSelected = itemIndex === selectedIndex

          return (
            <button
              aria-controls={getTabPanelId(block.id, itemId)}
              aria-selected={isSelected}
              className={`block-tabs-tab${isSelected ? ' is-active' : ''}`}
              data-admin-inline-editable="true"
              id={getTabId(block.id, itemId)}
              key={itemId}
              role="tab"
              tabIndex={isSelected ? 0 : -1}
              type="button"
              onClick={() => setActiveIndex(itemIndex)}
              onKeyDown={(event) => handleTabKeyDown(event, itemIndex)}
            >
              <ElementEditableText
                as="span"
                block={block}
                label={`Tab ${itemIndex + 1} label`}
                path={[...path, 'items', itemIndex, 'title']}
                styleTarget="tab"
                value={asText(item.title)}
              >
                {asText(item.title) || `Tab ${itemIndex + 1}`}
              </ElementEditableText>
            </button>
          )
        })}
      </ElementBox>

      <ElementBox
        as="div"
        aria-labelledby={getTabId(block.id, selectedItem?.id ?? selectedIndex)}
        block={block}
        className="block-tabs-panel"
        id={getTabPanelId(block.id, selectedItem?.id ?? selectedIndex)}
        role="tabpanel"
        styleTarget="panel"
      >
        <BlockList
          blocks={Array.isArray(selectedItem?.blocks) ? selectedItem.blocks : []}
          context={nestedContext}
          emptyMessage="Empty tab."
          path={[...path, 'items', selectedIndex, 'blocks']}
        />
      </ElementBox>
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
      <ElementEditableRichHtml block={block} className="block-two-column-side" html={normalizeSiteHtml(block.left ?? '').trim()} path={[...path, 'left']} styleTarget="left" title="Left Column" />
      <ElementEditableRichHtml block={block} className="block-two-column-side" html={normalizeSiteHtml(block.right ?? '').trim()} path={[...path, 'right']} styleTarget="right" title="Right Column" />
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
      <ElementEditableText as="h2" block={block} label="List Title" multiline path={[...path, 'title']} rows={3} styleTarget="title" value={block.title ?? ''}>
        {block.title ?? ''}
      </ElementEditableText>

      <ElementBox block={block} className="block-business-list-items" styleTarget="items">
        {items.map((item, index) => (
          <ElementBox block={block} className="block-business-list-item" key={item.id ?? index} styleTarget="item">
            {item.website || editable ? (
              <ElementEditableLink
                allowExternalUrl
                block={block}
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
                styleTarget="name"
              />
            ) : (
              <ElementEditableText
                as="span"
                block={block}
                className="block-business-list-name"
                label="Business Name"
                path={[...path, 'items', index, 'name']}
                styleTarget="name"
                value={item.name ?? ''}
              >
                {item.name ?? ''}
              </ElementEditableText>
            )}

            <ElementBox as="span" block={block} className="block-business-list-phones" styleTarget="phones">
              {(item.phones ?? []).map((phone, phoneIndex) => (
                <span className="block-business-list-phone" key={item.phoneIds?.[phoneIndex] ?? phoneIndex}>
                  <ElementBox as="span" block={block} styleTarget="phone">
                    <EditablePhoneText label={`Phone ${phoneIndex + 1}`} path={[...path, 'items', index, 'phones', phoneIndex]} value={phone} />
                  </ElementBox>
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
            </ElementBox>

            {controlsVisible ? (
              <EditorIconButton className="block-inline-command" data-admin-inline-editable="true" icon={Trash2} label="Remove business" tone="danger" onClick={() => removeItem(index)} />
            ) : null}
          </ElementBox>
        ))}
      </ElementBox>

      {controlsVisible ? (
        <EditorIconButton className="block-business-list-add block-inline-command" data-admin-inline-editable="true" icon={Plus} label="Add business" onClick={addItem} />
      ) : null}
    </section>
  )
}
