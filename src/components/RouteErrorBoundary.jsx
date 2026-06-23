import { Component } from 'react'

export class RouteErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled route render error.', error, info)
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.locationKey !== this.props.locationKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="page-section property-page property-page--status">
          <h1>Something went wrong</h1>
          <p>This page could not be displayed. Try going back or reloading.</p>
        </section>
      )
    }

    return this.props.children
  }
}
