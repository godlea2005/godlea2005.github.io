// Playwright CLI recipe: open the local /#tools page, then run-code --filename this file.
// Deterministic local image responses: no live favicon availability is assumed.
async (page) => {
  const origin = new URL(page.url()).origin;
  if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Use a local preview only');
  const evidence = [];
  const check = (value, message) => { if (!value) throw new Error(message); };
  for (const [width, height] of [[1440, 1000], [1024, 900], [390, 844]]) {
    for (const theme of ['dark', 'light']) {
      const context = await page.context().browser().newContext({ viewport: { width, height }, isMobile: width === 390, hasTouch: width === 390 });
      try {
        const p = await context.newPage();
        const requests = [];
        await p.route('https://favicon.im/**', async route => {
          requests.push(route.request().url());
          await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><rect width="28" height="28" fill="purple"/></svg>' });
        });
        await p.goto(`${origin}/#tools`);
        await p.evaluate(t => localStorage.setItem('wenhao-theme', t), theme);
        await p.reload();
        await p.getByRole('heading', { name: '工具导航', exact: true }).waitFor();
        await p.getByRole('button', { name: '全部展开', exact: true }).click();
        await p.waitForTimeout(5500);
        const tavily = p.locator('.tool-card').filter({ has: p.locator('strong', { hasText: 'Tavily' }) });
        check(!requests.some(x => x.includes('app.tavily.com')), `${width}/${theme}: distant logo requested early`);
        check(await tavily.locator('img:not([src])').count() === 1, 'deferred image disappeared');
        check(await p.locator('.tool-logo-fallback').count() === 0, 'healthy logos falsely timed out');
        await p.getByRole('button', { name: '全部收起', exact: true }).click();
        await p.waitForTimeout(400);
        await p.getByRole('button', { name: '全部展开', exact: true }).click();
        await p.waitForTimeout(400);
        await tavily.scrollIntoViewIfNeeded();
        await p.waitForFunction(() => [...document.querySelectorAll('.tool-card')].find(x => x.querySelector('strong')?.textContent === 'Tavily')?.querySelector('img')?.dataset.loaded === 'true');
        check(requests.some(x => x.includes('app.tavily.com')), 'distant request never activated');
        const geometry = await p.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          columns: getComputedStyle(document.querySelector('.tool-card-grid')).gridTemplateColumns.split(' ').length,
          targets: [...document.querySelectorAll('main input, main button, main .tool-card')].map(el => el.getBoundingClientRect().height),
        }));
        check(!geometry.overflow, 'horizontal overflow');
        check(geometry.columns === (width === 390 ? 1 : width === 1024 ? 2 : 3), 'wrong columns');
        check(geometry.targets.every(height => height >= 43.9), 'control/card below 44px (0.1px rounding tolerance)');
        await p.getByRole('searchbox', { name: '搜索工具' }).fill('no-such-tool-xyz');
        const clearHeight = await p.getByRole('button', { name: '清除搜索' }).evaluate(el => el.getBoundingClientRect().height);
        check(clearHeight >= 43.9, 'clear target under 44px');
        await p.getByRole('button', { name: '清除搜索' }).click();
        await p.unroute('https://favicon.im/**');
        await p.route('https://favicon.im/**', route => route.abort());
        await p.reload();
        await p.getByRole('heading', { name: '工具导航', exact: true }).waitFor();
        const first = p.locator('.tool-card').first();
        await first.scrollIntoViewIfNeeded();
        await first.locator('.tool-logo-fallback').waitFor();
        check((await first.locator('.tool-logo-fallback').innerText()).length === 2, 'failed-logo initials missing');
        evidence.push({ width, height, theme, successfulOffscreen: true, closeReopen: true, failureFallback: true, clearHeight, geometry });
      } finally { await context.close(); }
    }
  }
  return { status: 'PASS', evidence };
}
