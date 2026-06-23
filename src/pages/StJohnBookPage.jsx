import { ContentPage } from '../components/ContentPage'
import { PageLoadingState } from '../components/PageLoadingState'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function StJohnBookPage() {
  const page = useStructuredPageContent('stJohnBook')

  if (!page) {
    return <PageLoadingState />
  }

  return <ContentPage page={page} />
}
