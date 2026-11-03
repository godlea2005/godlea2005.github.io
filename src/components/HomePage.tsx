import type { Theme } from '../lib/theme'
import { HomeGuide } from './home-guide/HomeGuide'
import { SiteFooter } from './SiteFooter'
import { StatusScene } from './StatusScene'
import './home-sections.css'

export function HomePage({ theme }: { theme: Theme }) {
  return <>
    <main id="top">
      <StatusScene theme={theme} />
      <HomeGuide />
    </main>
    <SiteFooter />
  </>
}
