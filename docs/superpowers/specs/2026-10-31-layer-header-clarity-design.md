# Layer and header clarity

User approved the floating selected-layer direction and requested implementing it together with equal-height, edge-aligned header controls.

- Four archive sheets, not eight full outline paths. Use one visible contour per sheet with soft shadow, 60px collapsed spacing and 68px expanded spacing in the SVG coordinate system. Each sheet gets a small 01–04/category label. The selected sheet lifts 18px and moves right 8px; keep its pointer hit region stationary to prevent hover oscillation.
- Preserve four metric indices, green selection linkage, original styling and reduced-motion support. No fake statistics or asset changes.
- Header brand/navigation/settings all use 52px height and identical pill rounding/material. At phone widths use 48px consistently. Settings is a wider 76px pill (64px phone), not a circle; only its icon rotates.
- Position header 20px from viewport left/right on desktop, 12px on smaller screens, respecting safe areas. Keep navigation centered and all controls on one horizontal centerline without overflow down to 320px. Keep the existing dropdown/search/theme interactions.
- Only local changes. Do not push, publish, change backend data or touch user-owned `output/`.

Acceptance: four countable visible sheet contours, active-layer lift, equal header rectangles in both open/closed states, brand near left edge/settings near right edge, centered navigation, no mobile overflow, keyboard/pointer behavior unchanged. Verify automated tests/build and actual local preview.
