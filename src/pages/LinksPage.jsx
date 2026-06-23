import { ContentPage } from '../components/ContentPage'
import { PageLoadingState } from '../components/PageLoadingState'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function LinksPage() {
  const page = useStructuredPageContent('links')

  if (!page) {
    return <PageLoadingState />
  }

  return <ContentPage page={page} />
}
