import { useEffect, useState } from 'react'

const SCROLL_SHOW_THRESHOLD_PX = 400

export function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    let ticking = false

    function updateVisibility() {
      setIsVisible(window.scrollY > SCROLL_SHOW_THRESHOLD_PX)
      ticking = false
    }

    function handleScroll() {
      if (ticking) {
        return
      }

      ticking = true
      window.requestAnimationFrame(updateVisibility)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  function handleClick() {
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    window.scrollTo({ top: 0, left: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })

    // Move focus to the main landmark so keyboard and screen-reader users land
    // back at the top of the document instead of staying at the bottom.
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }

  return (
    <button
      aria-label="Back to top"
      className={`back-to-top ${isVisible ? 'back-to-top--visible' : ''}`.trim()}
      tabIndex={isVisible ? 0 : -1}
      type="button"
      onClick={handleClick}
    >
      <span aria-hidden="true" className="back-to-top-icon">
        &uarr;
      </span>
    </button>
  )
}
