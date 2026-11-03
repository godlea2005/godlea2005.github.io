# Local tools-directory browser regression

Start the local Vite preview, open its `/#tools` URL in Playwright CLI, take a fresh snapshot, then run:

```text
playwright-cli run-code --filename tests/browser/tool-directory-regression.js
```

The recipe uses the already-open local origin and rejects remote hosts. It creates six isolated Chromium contexts (1440×1000, 1024×900 and touch 390×844, dark/light), fulfills favicon requests with a deterministic SVG, waits beyond the five-second deadline before visiting Tavily, and checks close/reopen loading. It then tests failed requests, responsive grids, overflow and rendered hit areas including empty-state clearing. Fractional browser geometry allows 0.1px rounding; the unit suite independently requires computed minimum heights of 44px. No screenshots, external destination navigation, backend writes or artifacts in `output/` are produced. This is a CLI recipe, not a Vitest test or an added browser dependency.
