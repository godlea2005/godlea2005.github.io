import type { Theme } from '../lib/theme'
import { VisualNotes } from '../editorial/VisualNotes'
import { AboutSection } from './AboutSection'
import { CommerceHomeSection } from './CommerceHomeSection'
import { FeaturedNotes } from './FeaturedNotes'
import { SelectedWork } from './SelectedWork'
import { SiteFooter } from './SiteFooter'
import { StatusScene } from './StatusScene'
import { WritingPreview } from './WritingPreview'
import './home-sections.css'

export function HomePage({ theme }: { theme: Theme }) {
  return <>
    <main id="top">
      <StatusScene theme={theme} />
      <FeaturedNotes />
      <SelectedWork />
      <CommerceHomeSection />
      <VisualNotes />
      <WritingPreview />
      <AboutSection />
    </main>
    <SiteFooter />
  </>
}
