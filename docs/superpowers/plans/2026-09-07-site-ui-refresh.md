# September 7 visual and workflow continuation

The user has renewed the instruction to improve the whole site's UI, layout, theme and code against tblog.mmzhiku.xyz, superseding the September 4 exclusion of the homepage. All earlier confirmed functional constraints remain binding. Continue locally without repeating design approval.

## Visual decisions

Reference inspected live on September 7 at 1440 × 1000. It now has a short centered floating capsule nav, clearly differentiated active item, secondary menu expansion, generous hero space and a prominent personal identity. Retain our original content and licensed React Bits effects, not the reference's images, identity or text.

Home: full-bleed GradientWaves with existing configured values; one dominant WENHAO ParticleText identity, 博客, concise Chinese roles and intro. Remove the boxed technical diagram. Editorial composition, calm spacing, subtle boundary between immersive hero and useful sections. Make AI commerce, works, notes and contact genuinely navigable. No inert search dialog claiming a nonexistent feature: local search should navigate available sections. Nav keeps at most five primary entries: 主页, AI 电商, 作品, 文章, 我的. Guestbook/contact/music/admin live in relevant submenus. Clicking, keyboard, Escape, outside dismissal, active route and mobile work. Dark neutral surfaces, complete warm light mode. Clear 44px controls.

Workbench: keep September 4 spec for 1280px layout, three steps 产品 → 市场 → 确认, compact run summary, one action per phase, overlay history with focus management, accurate error recovery, no ghost projects. Professional data and current result/admin/credits/retention contracts remain. Auth gate should have a concise product explanation and single login action, not technical OAuth prose. CSS modules own visual rules rather than appending contradictory overrides.

## Execution consolidation

Ruling: implement the requested connected visual surface in a single integrated UI task after reviewing the existing taxonomy change; it subsumes old tasks 4–7 plus the newly requested home/nav changes. These share JSX, visual tokens and responsive breakpoints and must be checked together. Preserve the form's current outward props until the flow extraction lands. Cost if wrong: one larger review surface, mitigated by targeted tests and browser verification.

1. Finish and independently review the interrupted taxonomy task (old task 1).
2. Implement home/nav/theme, stepped workbench editor, run panel, history drawer and music hit areas as one visual integration task. Single implementer, independent task review.
3. Implement the authenticated request helper (old task 2), independent task review.
4. Implement the run reducer and hook using the now-stable editor interfaces (old task 3), independent task review.
5. Full build/tests, desktop/tablet/mobile light/dark browser QA and broad review. Record changes and limits in project log; expose the correct local worktree preview. No production database writes for cosmetic QA. Deployment follows the existing publishing authorization only after verification.

## Verification

Reference and before screenshots: root output/playwright/reference-sep7.png, reference-nav-sep7.png, local-before-sep7.png. Local worktree Vite is http://127.0.0.1:5175/ (avoid stale root 5173). Screenshots at 1440×1000, 1024×900, 390×844. Test auth/retry/history/keyboard interactions with mocks; clearly distinguish mock verification from actual signed-in production end-to-end. Never expose secrets or signed media URLs.
