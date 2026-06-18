import { useEffect, useState } from 'react'
import {
  COMMON_WEB_IMAGE_SIZE_PRESETS,
  getImageSizePresetKey,
  getOriginalImageDimensions,
  normalizeImageDimension,
} from '../lib/imageSizePresets'

function formatPresetLabel(preset) {
  return `${preset.label} (${preset.width} x ${preset.height})`
}

function parseDimensionInput(value) {
  return normalizeImageDimension(value) || null
}

function formatDimensions(width, height) {
  return width && height ? `${width} x ${height}` : ''
}

function groupPresets(presets) {
  return presets.reduce((groups, preset) => {
    const groupName = preset.group || 'Common Sizes'
    const nextGroups = groups
    const group = nextGroups.find((entry) => entry.name === groupName)

    if (group) {
      group.presets.push(preset)
    } else {
      nextGroups.push({ name: groupName, presets: [preset] })
    }

    return nextGroups
  }, [])
}

export function AdminImageSizeControls({ disabled = false, displaySize = {}, image = {}, onChange }) {
  const currentWidth = normalizeImageDimension(image?.width)
  const currentHeight = normalizeImageDimension(image?.height)
  const displayedWidth = normalizeImageDimension(displaySize?.width)
  const displayedHeight = normalizeImageDimension(displaySize?.height)
  const explicitOriginalSize = getOriginalImageDimensions(image)
  const [measuredOriginalSize, setMeasuredOriginalSize] = useState({ height: 0, url: '', width: 0 })
  const originalWidth = explicitOriginalSize.width || (measuredOriginalSize.url === image?.url ? measuredOriginalSize.width : 0)
  const originalHeight = explicitOriginalSize.height || (measuredOriginalSize.url === image?.url ? measuredOriginalSize.height : 0)
  const hasOriginalSize = Boolean(originalWidth && originalHeight)
  const visibleWidth = currentWidth || displayedWidth || originalWidth
  const visibleHeight = currentHeight || displayedHeight || originalHeight
  const savedSizeLabel = currentWidth && currentHeight ? formatDimensions(currentWidth, currentHeight) : 'Page default'
  const displayedSizeLabel = displayedWidth && displayedHeight ? formatDimensions(displayedWidth, displayedHeight) : ''
  const defaultOptionLabel = displayedSizeLabel ? `Page default - displayed ${displayedSizeLabel}` : 'Page default - measure from layout'
  const presetValue =
    hasOriginalSize && currentWidth === originalWidth && currentHeight === originalHeight ? 'original' : getImageSizePresetKey(image)
  const presetGroups = groupPresets(COMMON_WEB_IMAGE_SIZE_PRESETS)
  const [aspectRatioLocked, setAspectRatioLocked] = useState(true)

  useEffect(() => {
    const imageUrl = String(image?.url ?? '').trim()

    if (!imageUrl || (explicitOriginalSize.width && explicitOriginalSize.height)) {
      return undefined
    }

    let cancelled = false
    const probeImage = new Image()

    probeImage.onload = () => {
      if (cancelled) {
        return
      }

      setMeasuredOriginalSize({
        height: normalizeImageDimension(probeImage.naturalHeight),
        url: imageUrl,
        width: normalizeImageDimension(probeImage.naturalWidth),
      })
    }

    probeImage.src = imageUrl

    return () => {
      cancelled = true
    }
  }, [explicitOriginalSize.height, explicitOriginalSize.width, image?.url])

  function getActiveAspectRatio() {
    if (currentWidth && currentHeight) {
      return currentWidth / currentHeight
    }

    if (displayedWidth && displayedHeight) {
      return displayedWidth / displayedHeight
    }

    return originalWidth && originalHeight ? originalWidth / originalHeight : 0
  }

  function handleAspectRatioLockChange(event) {
    setAspectRatioLocked(event.target.checked)
  }

  function handlePresetChange(event) {
    const nextValue = event.target.value

    if (!nextValue) {
      onChange({ height: null, width: null })
      return
    }

    if (nextValue === 'custom') {
      return
    }

    if (nextValue === 'original') {
      if (hasOriginalSize) {
        onChange({
          height: originalHeight,
          originalHeight,
          originalWidth,
          width: originalWidth,
        })
      }
      return
    }

    const preset = COMMON_WEB_IMAGE_SIZE_PRESETS.find((entry) => entry.key === nextValue)

    if (!preset) {
      return
    }

    onChange({ height: preset.height, width: preset.width })
  }

  function handleWidthChange(value) {
    const nextWidth = parseDimensionInput(value)
    const aspectRatio = getActiveAspectRatio()
    const nextHeight = aspectRatioLocked && nextWidth && aspectRatio ? Math.max(1, Math.round(nextWidth / aspectRatio)) : currentHeight || null

    onChange({ height: nextHeight, width: nextWidth })
  }

  function handleHeightChange(value) {
    const nextHeight = parseDimensionInput(value)
    const aspectRatio = getActiveAspectRatio()
    const nextWidth = aspectRatioLocked && nextHeight && aspectRatio ? Math.max(1, Math.round(nextHeight * aspectRatio)) : currentWidth || null

    onChange({ height: nextHeight, width: nextWidth })
  }

  return (
    <div className="admin-image-size-controls">
      <label className="admin-field admin-field--wide">
        <span>Image Size</span>
        <select disabled={disabled} value={presetValue} onChange={handlePresetChange}>
          <option value="">{defaultOptionLabel}</option>
          {hasOriginalSize ? <option value="original">Original image size ({formatDimensions(originalWidth, originalHeight)})</option> : null}
          {presetGroups.map((group) => (
            <optgroup key={group.name} label={group.name}>
              {group.presets.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {formatPresetLabel(preset)}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="custom">Custom dimensions</option>
        </select>
      </label>

      <p className="admin-image-size-status">
        <span>Saved: {savedSizeLabel}</span>
        {displayedSizeLabel ? <span>Displayed: {displayedSizeLabel}</span> : null}
      </p>

      <label className="admin-image-ratio-lock">
        <input checked={aspectRatioLocked} disabled={disabled} type="checkbox" onChange={handleAspectRatioLockChange} />
        <span>Maintain aspect ratio while typing custom width or height</span>
      </label>

      <div className="admin-image-size-grid">
        <label className="admin-field">
          <span>Width</span>
          <input
            disabled={disabled}
            min="1"
            placeholder="Measure from layout"
            type="number"
            value={visibleWidth || ''}
            onChange={(event) => handleWidthChange(event.target.value)}
          />
        </label>
        <label className="admin-field">
          <span>Height</span>
          <input
            disabled={disabled}
            min="1"
            placeholder="Measure from layout"
            type="number"
            value={visibleHeight || ''}
            onChange={(event) => handleHeightChange(event.target.value)}
          />
        </label>
      </div>

      <p className="admin-image-size-help">
        Pick a common web size, use the original file dimensions, or enter custom pixels. Large sizes may still be capped by the page column width.
      </p>
    </div>
  )
}
