# Full-bleed particle hero design

## Goal

Turn the homepage opening into a full-viewport visual field instead of a rounded card. Keep the existing Gradient Waves configuration, overlay the site navigation, and make `WENHAO` the main interactive particle-text signature.

## Layout

- The hero fills the full viewport width and at least `100svh`; it has no outer margin, border, or corner radius.
- Gradient Waves and its scrim cover the entire hero, including the area behind the navigation.
- Navigation remains constrained to the shared 1200px frame and floats at the top of the hero.
- Hero content uses a separate 1200px inner frame so the typography and abstract studio scene stay precisely aligned.
- On mobile, the background still reaches every screen edge while content keeps a 16px safe inset.

## Particle signature

- A lightweight Canvas component renders `WENHAO` from sampled text pixels.
- Pointer movement gently repels nearby particles; friction and easing return them to their original letter positions.
- Particle density and text size respond to container dimensions.
- A readable DOM fallback remains until Canvas is ready and stays available if Canvas cannot initialize.
- `prefers-reduced-motion` renders the particle text without a continuous animation loop.

## Visual hierarchy

1. Small index and professional roles establish context.
2. The Chinese greeting identifies the owner.
3. `WENHAO` becomes the largest visual signature.
4. Statement and archive link provide the next action.
5. The abstract studio scene remains secondary on the right.

## Verification

- Production build succeeds.
- Desktop hero starts at the top edge, spans the viewport, and keeps a 1200px inner frame.
- Mobile hero has no horizontal overflow or rounded card edge.
- The particle canvas initializes, responds to pointer movement, and retains the `WENHAO` fallback.
- Navigation, mobile menu, theme control, and page routing remain usable.
