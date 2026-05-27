import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="page-section not-found">
      <div className="eyebrow">404</div>
      <h1>That route is not part of the rebuild yet.</h1>
      <p>
        Return to the homepage or use the main navigation while the public-site rebuild is in
        progress.
      </p>
      <div className="hero-actions">
        <Link className="button-link button-link--primary" to="/">
          Back home
        </Link>
      </div>
    </section>
  )
}
