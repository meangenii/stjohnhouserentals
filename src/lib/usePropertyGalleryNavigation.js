import { useCallback, useMemo, useRef } from 'react'

const GALLERY_SWIPE_THRESHOLD_PX = 44
const GALLERY_SWIPE_AXIS_RATIO = 1.2

function isInteractiveGalleryControl(target) {
  return typeof Element !== 'undefined' && target instanceof Element && Boolean(target.closest('button, a'))
}

export function usePropertyGalleryNavigation(imageCount, setActiveImageIndex) {
  const pointerStartRef = useRef(null)

  const showPreviousGalleryImage = useCallback(() => {
    if (imageCount <= 1) {
      return
    }

    setActiveImageIndex((currentIndex) => {
      const normalizedIndex = Math.min(Math.max(currentIndex, 0), imageCount - 1)
      return normalizedIndex === 0 ? imageCount - 1 : normalizedIndex - 1
    })
  }, [imageCount, setActiveImageIndex])

  const showNextGalleryImage = useCallback(() => {
    if (imageCount <= 1) {
      return
    }

    setActiveImageIndex((currentIndex) => {
      const normalizedIndex = Math.min(Math.max(currentIndex, 0), imageCount - 1)
      return normalizedIndex === imageCount - 1 ? 0 : normalizedIndex + 1
    })
  }, [imageCount, setActiveImageIndex])

  const galleryPointerHandlers = useMemo(
    () => ({
      onPointerCancel: () => {
        pointerStartRef.current = null
      },
      onPointerDown: (event) => {
        if (imageCount <= 1 || event.pointerType === 'mouse' || !event.isPrimary || isInteractiveGalleryControl(event.target)) {
          return
        }

        pointerStartRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      },
      onPointerUp: (event) => {
        const start = pointerStartRef.current
        pointerStartRef.current = null
        event.currentTarget.releasePointerCapture?.(event.pointerId)

        if (!start || start.pointerId !== event.pointerId) {
          return
        }

        const deltaX = event.clientX - start.x
        const deltaY = event.clientY - start.y
        const absX = Math.abs(deltaX)
        const absY = Math.abs(deltaY)

        if (absX < GALLERY_SWIPE_THRESHOLD_PX || absX < absY * GALLERY_SWIPE_AXIS_RATIO) {
          return
        }

        if (deltaX < 0) {
          showNextGalleryImage()
        } else {
          showPreviousGalleryImage()
        }
      },
    }),
    [imageCount, showNextGalleryImage, showPreviousGalleryImage],
  )

  return {
    galleryPointerHandlers,
    showNextGalleryImage,
    showPreviousGalleryImage,
  }
}
