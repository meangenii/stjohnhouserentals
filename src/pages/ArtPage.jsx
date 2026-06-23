import { ContentPage } from '../components/ContentPage'
import { PageLoadingState } from '../components/PageLoadingState'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function ArtPage() {
  const page = useStructuredPageContent('art')

  if (!page) {
    return <PageLoadingState />
  }

  return <ContentPage page={page} />
}
