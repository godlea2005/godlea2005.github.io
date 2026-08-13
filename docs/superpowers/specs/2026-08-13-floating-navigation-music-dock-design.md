# Floating navigation and music dock design

## Objective

Replace the current flat header and permanently expanded music bar with a restrained floating interface inspired by the interaction model of the reference site. Preserve Wenhao's visual identity, existing routes, audio state, playlist, and Supabase-backed pages.

## Navigation

### Desktop

- The navigation floats above page content and remains visible while scrolling.
- The center navigation is a dark translucent pill with blur, a subtle border, and compact spacing.
- `主页` has a distinct filled active state on the homepage.
- `个人主站` and `工具导航` remain direct links.
- `文章`, `联系我`, and `我的` remain buttons with chevrons.
- Clicking a menu button opens one rounded glass panel directly below that button. Opening another closes the previous panel.
- Clicking outside, pressing Escape, selecting a link, or changing route closes the panel.
- The brand sits in a separate pill on the upper left. Search and theme controls sit in a separate pill on the upper right.
- All controls have visible hover and keyboard focus states.

### Mobile

- The header becomes two floating pills: brand on the left and `目录` plus theme control on the right.
- `目录` opens a full-width inset glass menu below the header.
- Dropdown groups expand inside the mobile menu instead of spawning detached panels.
- The header respects device safe-area insets and never causes horizontal scrolling.

## Music launcher

### Collapsed state

- The global player defaults to a single square music button at the lower right.
- The launcher is approximately 54px on desktop and 48px on mobile, with a dark glass surface and a simple music-note icon.
- When audio is playing, a restrained pulse/equalizer treatment communicates activity without enlarging the control.
- The launcher has an explicit accessible label reflecting whether the player is open.

### Expanded desktop player

- Clicking the launcher opens a right-aligned glass panel above it.
- The panel shows the current title and artist, current time and duration, seek control, previous/play-next controls, volume, playlist access, and a link to the full music page.
- Track text truncates safely without changing panel width.
- The existing `MusicProvider` remains the single source of playback state; opening or closing the panel never interrupts audio.
- Clicking outside, pressing Escape, or clicking the launcher again closes the panel.
- The existing playlist overlay remains available from the expanded player.

### Expanded mobile player

- The same content opens as a bottom sheet with an inset margin and safe-area padding.
- The sheet remains below the mobile navigation layer and above page content.
- Closing the sheet does not pause playback.

## Component boundaries

- `FloatingHeader` owns header layout, mobile-menu state, dropdown state, outside-click handling, and keyboard dismissal.
- `GlobalMusicDock` owns the collapsed launcher and expanded-player state while delegating audio actions to `MusicProvider`.
- Existing playlist and music-page components remain independent and are reused rather than duplicated.
- Styling stays in focused navigation and music styles; homepage visual effects do not control either component.

## Error and fallback behavior

- Missing audio metadata displays stable fallback labels without breaking the panel.
- Rejected playback promises keep the player open so the user can retry.
- Browsers without backdrop-filter receive an opaque dark surface with the same contrast.
- Reduced-motion mode disables pulsing and panel motion while preserving state changes.

## Verification

- Production build succeeds.
- Desktop and 390px mobile layouts have no horizontal overflow.
- Navigation dropdowns open, switch, close on outside click and Escape, and route correctly.
- Mobile menu opens and nested groups remain usable.
- Music launcher opens and closes without pausing active audio.
- Play, pause, previous, next, seek, volume, playlist, and music-page navigation remain functional.
- Keyboard focus is visible and controls expose accurate accessible names and expanded states.
- Browser console contains no application errors during the tested flows.
