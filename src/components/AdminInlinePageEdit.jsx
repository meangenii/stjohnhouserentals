import { lazy, Suspense, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { getImageDimensions, normalizeImageDimension } from '../lib/imageSizePresets'
import { SiteContentPreviewContext } from '../lib/siteContentPreview'
import { AdminImageSizeControls } from './AdminImageSizeControls'
import { RichTextValue } from './RichTextValue'

const AdminMediaManager = lazy(() =>
  import('./AdminMediaManager').then((module) => ({
    default: module.AdminMediaManager,
  })),
)

const AdminRichTextEditor = lazy(() =>
  import('./AdminRichTextEditor').then((module) => ({
    default: module.AdminRichTextEditor,
  })),
)

function pathToKey(path = []) {
  return path.map((segment) => String(segment)).join('.')
}

function usePageEditor() {
  const previewState = useContext(SiteContentPreviewContext)
  return previewState?.pageEditor ?? null
}

function useEditableField(path, fieldKey = '') {
  const pageEditor = usePageEditor()
  const id = fieldKey || pathToKey(path)
  const isEnabled = Boolean(pageEditor)
  const isActive = isEnabled && pageEditor.activeFieldId === id

  function activate() {
    if (pageEditor?.disabled) {
      return
    }

    pageEditor?.setActiveFieldId(id)
  }

  function close() {
    pageEditor?.setActiveFieldId('')
  }

  function updatePath(targetPath, nextValue) {
    pageEditor?.updatePath(targetPath, nextValue)
  }

  return {
    disabled: Boolean(pageEditor?.disabled),
    isActive,
    isEnabled,
    activate,
    close,
    updatePath,
  }
}

function InlinePopover({ active, onClose, title, children }) {
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!active) {
      return undefined
    }

    const previousBodyOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [active, onClose])

  if (!active) {
    return null
  }

  if (typeof document === 'undefined') {
    return null
  }

  function handleBackdropPointerDown(event) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return createPortal(
    <div
      className="admin-inline-popover-shell"
      role="presentation"
      onMouseDown={handleBackdropPointerDown}
    >
      <div ref={popoverRef} aria-modal="true" className="admin-inline-popover" role="dialog" aria-label={title}>
        <div className="admin-inline-popover-header">
          <strong>{title}</strong>
          <button className="button-link button-link--ghost admin-inline-popover-close" type="button" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="admin-inline-popover-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

function buildEditableClassName(className = '', isEnabled = false, isActive = false) {
  return [className, isEnabled ? 'admin-inline-editable-target' : '', isActive ? 'admin-inline-editable-target--active' : '']
    .filter(Boolean)
    .join(' ')
}

function InlinePopoverContent({ children }) {
  return <Suspense fallback={<p className="admin-note">Loading editor...</p>}>{children}</Suspense>
}

export function EditableText({
  as: Component = 'span',
  children,
  className = '',
  label = 'Text',
  multiline = false,
  path,
  rows = 4,
  value = '',
  ...rest
}) {
  const anchorRef = useRef(null)
  const field = useEditableField(path)
  const isActive = field.isActive
  const displayValue = value ?? (typeof children === 'string' ? children : '')
  const isCompactEditor = !multiline

  function handleActivate(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    field.activate()
  }

  return (
    <>
      <Component
        ref={anchorRef}
        {...rest}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        onClick={handleActivate}
      >
        <RichTextValue value={displayValue} />
      </Component>

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title={label}>
        <InlinePopoverContent>
          <AdminRichTextEditor
            compact={isCompactEditor}
            label={label}
            onChange={(nextValue) => field.updatePath(path, nextValue)}
            sourceRows={rows}
            value={value ?? ''}
          />
        </InlinePopoverContent>
      </InlinePopover>
    </>
  )
}

export function EditableLink({
  className = '',
  destination = '',
  destinationLabel = 'Link',
  destinationPath,
  external = false,
  label = '',
  labelLabel = 'Text',
  labelPath,
  target = undefined,
  ...rest
}) {
  const anchorRef = useRef(null)
  const field = useEditableField(labelPath ?? destinationPath, `${pathToKey(labelPath ?? [])}:${pathToKey(destinationPath ?? [])}`)
  const isActive = field.isActive
  const Component = external ? 'a' : Link
  const linkProps = external
    ? {
        href: destination,
        rel: 'noreferrer',
        target: target ?? '_blank',
      }
    : {
        to: destination,
      }

  function handleActivate(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    field.activate()
  }

  return (
    <>
      <Component
        ref={anchorRef}
        {...linkProps}
        {...rest}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        onClick={handleActivate}
      >
        <RichTextValue value={label} />
      </Component>

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title={labelLabel}>
        <InlinePopoverContent>
          <AdminRichTextEditor compact label={labelLabel} onChange={(nextValue) => field.updatePath(labelPath, nextValue)} value={label ?? ''} />
          {destinationPath ? (
            <label className="admin-field">
              <span>{destinationLabel}</span>
              <input type="text" value={destination ?? ''} onChange={(event) => field.updatePath(destinationPath, event.target.value)} />
            </label>
          ) : null}
        </InlinePopoverContent>
      </InlinePopover>
    </>
  )
}

export function EditableButton({
  className = '',
  disabled = false,
  label = '',
  labelLabel = 'Button Text',
  labelPath,
  type = 'button',
  ...rest
}) {
  const anchorRef = useRef(null)
  const field = useEditableField(labelPath)
  const isActive = field.isActive

  function handleActivate(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    field.activate()
  }

  return (
    <>
      <button
        ref={anchorRef}
        {...rest}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        disabled={disabled}
        type={type}
        onClick={handleActivate}
      >
        <RichTextValue value={label} />
      </button>

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title={labelLabel}>
        <InlinePopoverContent>
          <AdminRichTextEditor compact label={labelLabel} onChange={(nextValue) => field.updatePath(labelPath, nextValue)} value={label ?? ''} />
        </InlinePopoverContent>
      </InlinePopover>
    </>
  )
}

function ImagePopoverFields({ displaySize = {}, field, image = {}, path, showSizeControls = true, title = 'Image' }) {
  function handleSizeChange(nextSize) {
    const nextImage = {
      kind: image?.kind ?? 'image',
      ...image,
      height: nextSize.height,
      width: nextSize.width,
    }

    if (Object.prototype.hasOwnProperty.call(nextSize, 'originalHeight')) {
      nextImage.originalHeight = nextSize.originalHeight
    }

    if (Object.prototype.hasOwnProperty.call(nextSize, 'originalWidth')) {
      nextImage.originalWidth = nextSize.originalWidth
    }

    field.updatePath(path, nextImage)
  }

  function handleSelectImage(nextUrl, entry) {
    const originalWidth = normalizeImageDimension(entry?.width)
    const originalHeight = normalizeImageDimension(entry?.height)

    field.updatePath(path, {
      kind: image?.kind ?? 'image',
      ...image,
      url: nextUrl,
      alt: image?.alt || entry?.alt || '',
      title: 'title' in image || entry?.title ? image?.title || entry?.title || '' : undefined,
      originalHeight: originalHeight || null,
      originalWidth: originalWidth || null,
    })
  }

  return (
    <>
      <label className="admin-field">
        <span>Image URL</span>
        <input type="text" value={image?.url ?? ''} onChange={(event) => field.updatePath([...path, 'url'], event.target.value)} />
      </label>
      <label className="admin-field">
        <span>Alt Text</span>
        <input type="text" value={image?.alt ?? ''} onChange={(event) => field.updatePath([...path, 'alt'], event.target.value)} />
      </label>
      {'title' in image ? (
        <label className="admin-field">
          <span>Title</span>
          <input type="text" value={image?.title ?? ''} onChange={(event) => field.updatePath([...path, 'title'], event.target.value)} />
        </label>
      ) : null}
      {showSizeControls ? <AdminImageSizeControls disabled={field.disabled} displaySize={displaySize} image={image} onChange={handleSizeChange} /> : null}
      <AdminMediaManager
        currentUrl={image?.url ?? ''}
        disabled={field.disabled}
        onClear={() => field.updatePath([...path, 'url'], '')}
        onSelect={handleSelectImage}
        preferredOwnerType="page"
        title={`${title} Media`}
      />
    </>
  )
}

function getEditableImageStyle(image, style) {
  const { width, height } = getImageDimensions(image)

  if (!width && !height) {
    return style
  }

  return {
    ...style,
    width: width ? `${width}px` : style?.width,
    height: height ? `${height}px` : style?.height,
    maxWidth: style?.maxWidth ?? '100%',
    aspectRatio: width && height ? `${width} / ${height}` : style?.aspectRatio,
    objectFit: width || height ? 'contain' : style?.objectFit,
  }
}

export function EditableImage({ alt = '', className = '', image = null, path, src = '', ...rest }) {
  const anchorRef = useRef(null)
  const field = useEditableField(path)
  const isActive = field.isActive
  const imageStyle = getEditableImageStyle(image, rest.style)
  const [displaySize, setDisplaySize] = useState({ height: 0, width: 0 })

  function measureDisplayedImage() {
    const imageElement = anchorRef.current

    if (!imageElement || typeof imageElement.getBoundingClientRect !== 'function') {
      return
    }

    const rect = imageElement.getBoundingClientRect()
    const width = normalizeImageDimension(Math.round(rect.width))
    const height = normalizeImageDimension(Math.round(rect.height))

    if (!width || !height) {
      return
    }

    setDisplaySize((currentSize) => {
      if (currentSize.width === width && currentSize.height === height) {
        return currentSize
      }

      return { height, width }
    })
  }

  useLayoutEffect(() => {
    if (!isActive || !src) {
      return undefined
    }

    measureDisplayedImage()

    const imageElement = anchorRef.current
    let animationFrameId = 0
    const scheduleMeasure = () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      animationFrameId = window.requestAnimationFrame(measureDisplayedImage)
    }
    const resizeObserver =
      typeof ResizeObserver === 'undefined' || !imageElement ? null : new ResizeObserver(scheduleMeasure)

    resizeObserver?.observe(imageElement)
    window.addEventListener('resize', scheduleMeasure)

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [image?.height, image?.width, isActive, src])

  function handleActivate(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    field.activate()
  }

  function handleImageLoad(event) {
    rest.onLoad?.(event)
    measureDisplayedImage()
  }

  return (
    <>
      {src ? (
        <img
          ref={anchorRef}
          {...rest}
          alt={alt}
          className={buildEditableClassName(className, field.isEnabled, isActive)}
          data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
          onClick={handleActivate}
          onLoad={handleImageLoad}
          src={src}
          style={imageStyle}
        />
      ) : (
        <button
          ref={anchorRef}
          className={buildEditableClassName(`${className} admin-inline-image-placeholder`.trim(), field.isEnabled, isActive)}
          data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
          type="button"
          onClick={handleActivate}
        >
          Add image
        </button>
      )}

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title="Image">
        <InlinePopoverContent>
          <ImagePopoverFields displaySize={displaySize} field={field} image={image} path={path} title="Image" />
        </InlinePopoverContent>
      </InlinePopover>
    </>
  )
}

export function EditableBackgroundSection({
  as: Component = 'section',
  children,
  className = '',
  image = null,
  path,
  style,
  ...rest
}) {
  const anchorRef = useRef(null)
  const field = useEditableField(path)
  const isActive = field.isActive

  function handleActivate(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    field.activate()
  }

  return (
    <>
      <Component
        ref={anchorRef}
        {...rest}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        onClick={handleActivate}
        style={style}
      >
        {children}
      </Component>

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title="Background Image">
        <InlinePopoverContent>
          <ImagePopoverFields field={field} image={image} path={path} showSizeControls={false} title="Background Image" />
        </InlinePopoverContent>
      </InlinePopover>
    </>
  )
}

export function EditableRichHtml({ className = '', html = '', path, title = 'Body HTML' }) {
  const anchorRef = useRef(null)
  const field = useEditableField(path)
  const isActive = field.isActive

  function handleActivate(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    field.activate()
  }

  return (
    <>
      <div
        ref={anchorRef}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleActivate}
      />

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title={title}>
        <InlinePopoverContent>
          <AdminRichTextEditor label={title} onChange={(nextValue) => field.updatePath(path, nextValue)} value={html} />
        </InlinePopoverContent>
      </InlinePopover>
    </>
  )
}
