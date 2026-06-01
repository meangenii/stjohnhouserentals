import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="page-section not-found">
      <div className="eyebrow">404</div>
      <h1>We couldn't find that page.</h1>
      <p>
        Return to the homepage or use the main navigation to keep exploring St. John House
        Rentals.
      </p>
      <div className="hero-actions">
        <Link className="button-link button-link--primary" to="/">
          Back home
        </Link>
      </div>
    </section>
  )
}
