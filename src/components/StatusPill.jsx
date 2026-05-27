export function StatusPill({ health }) {
  const copy =
    health.state === 'ok'
      ? 'Functions online'
      : health.state === 'offline'
        ? 'Functions offline'
        : 'Checking API'

  return <div className={`status-pill status-pill--${health.state}`}>{copy}</div>
}
