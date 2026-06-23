import { ContentPage } from '../components/ContentPage'
import { PageLoadingState } from '../components/PageLoadingState'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function JewelryPage() {
  const page = useStructuredPageContent('jewelry')

  if (!page) {
    return <PageLoadingState />
  }

  return <ContentPage page={page} />
}
