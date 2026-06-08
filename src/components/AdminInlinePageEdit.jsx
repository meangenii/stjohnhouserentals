import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { SiteContentPreviewContext } from '../lib/siteContentPreview'
import { AdminMediaManager } from './AdminMediaManager'
import { AdminRichTextEditor } from './AdminRichTextEditor'

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

function usePopoverPosition(active, anchorRef, popoverRef) {
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!active) {
      return undefined
    }

    function syncPosition() {
      const anchor = anchorRef.current
      const popover = popoverRef.current

      if (!anchor || !popover) {
        return
      }

      const anchorRect = anchor.getBoundingClientRect()
      const popoverRect = popover.getBoundingClientRect()
      const viewportPadding = 12
      const preferredTop = anchorRect.bottom + 10
      const maxTop = window.innerHeight - popoverRect.height - viewportPadding
      const aboveTop = anchorRect.top - popoverRect.height - 10
      const top =
        preferredTop <= maxTop
          ? preferredTop
          : aboveTop >= viewportPadding
            ? aboveTop
            : Math.max(viewportPadding, maxTop)
      const maxLeft = window.innerWidth - popoverRect.width - viewportPadding
      const left = Math.min(Math.max(viewportPadding, anchorRect.left), Math.max(viewportPadding, maxLeft))

      setPosition({ top, left })
    }

    syncPosition()
    window.addEventListener('resize', syncPosition)
    window.addEventListener('scroll', syncPosition, true)

    return () => {
      window.removeEventListener('resize', syncPosition)
      window.removeEventListener('scroll', syncPosition, true)
    }
  }, [active, anchorRef, popoverRef])

  return position
}

function InlinePopover({ active, anchorRef, onClose, title, children }) {
  const popoverRef = useRef(null)
  const position = usePopoverPosition(active, anchorRef, popoverRef)

  useEffect(() => {
    if (!active) {
      return undefined
    }

    function handlePointerDown(event) {
      const target = event.target

      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return
      }

      onClose()
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [active, anchorRef, onClose])

  if (!active) {
    return null
  }

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      ref={popoverRef}
      className="admin-inline-popover"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <div className="admin-inline-popover-header">
        <strong>{title}</strong>
        <button className="button-link button-link--ghost admin-inline-popover-close" type="button" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="admin-inline-popover-body">{children}</div>
    </div>,
    document.body,
  )
}

function buildEditableClassName(className = '', isEnabled = false, isActive = false) {
  return [className, isEnabled ? 'admin-inline-editable-target' : '', isActive ? 'admin-inline-editable-target--active' : '']
    .filter(Boolean)
    .join(' ')
}

function useAutofocus(active) {
  const controlRef = useRef(null)

  useLayoutEffect(() => {
    if (!active) {
      return
    }

    controlRef.current?.focus?.()
  }, [active])

  return controlRef
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
  const inputRef = useAutofocus(isActive)
  const displayValue = children ?? value

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
        {displayValue}
      </Component>

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title={label}>
        <label className="admin-field">
          <span>{label}</span>
          {multiline ? (
            <textarea
              ref={inputRef}
              rows={rows}
              value={value ?? ''}
              onChange={(event) => field.updatePath(path, event.target.value)}
            />
          ) : (
            <input ref={inputRef} type="text" value={value ?? ''} onChange={(event) => field.updatePath(path, event.target.value)} />
          )}
        </label>
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
  const labelRef = useAutofocus(isActive)
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
        {label}
      </Component>

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title={labelLabel}>
        <label className="admin-field">
          <span>{labelLabel}</span>
          <input ref={labelRef} type="text" value={label ?? ''} onChange={(event) => field.updatePath(labelPath, event.target.value)} />
        </label>
        {destinationPath ? (
          <label className="admin-field">
            <span>{destinationLabel}</span>
            <input type="text" value={destination ?? ''} onChange={(event) => field.updatePath(destinationPath, event.target.value)} />
          </label>
        ) : null}
      </InlinePopover>
    </>
  )
}

function ImagePopoverFields({ field, image = {}, path, title = 'Image' }) {
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
      <AdminMediaManager
        currentUrl={image?.url ?? ''}
        disabled={field.disabled}
        onClear={() => field.updatePath([...path, 'url'], '')}
        onSelect={(nextUrl) => field.updatePath([...path, 'url'], nextUrl)}
        preferredOwnerType="page"
        title={`${title} Media`}
      />
    </>
  )
}

export function EditableImage({ alt = '', className = '', image = null, path, src = '', ...rest }) {
  const anchorRef = useRef(null)
  const field = useEditableField(path)
  const isActive = field.isActive

  if (!src) {
    return null
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
      <img
        ref={anchorRef}
        {...rest}
        alt={alt}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        onClick={handleActivate}
        src={src}
      />

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title="Image">
        <ImagePopoverFields field={field} image={image} path={path} title="Image" />
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

    if (event.target !== anchorRef.current) {
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
        <ImagePopoverFields field={field} image={image} path={path} title="Background Image" />
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
        <AdminRichTextEditor label={title} onChange={(nextValue) => field.updatePath(path, nextValue)} value={html} />
      </InlinePopover>
    </>
  )
}
