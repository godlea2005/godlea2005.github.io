type IconName = 'settings' | 'search' | 'bell' | 'sun' | 'moon' | 'system'
const paths: Record<IconName, string> = {
  settings: 'M4 6h7m4 0h5M4 12h3m4 0h9M4 18h10m4 0h2M11 3v6M7 9v6m7 0v6',
  search: 'm16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  bell: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zm5 3h4M12 2v2',
  sun: 'M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z',
  system: 'M3 3h18v13H3zm9 13v5m-5 0h10',
}
export function SiteIcon({ name }: { name: IconName }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg> }
