import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectContrast, expectNoHorizontalOverflow, expectUsableLayout, sizes, watchConsole } from './helpers';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

for (const size of sizes) {
  test(`update banner appears when version.json changes (${size.name})`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.route('**/version.json', (route) => route.fulfill({ json: { version: '9.9.9', hash: 'ffffff', date: '2099-01-01' } }));
    await page.goto('/?updateCheck=1');
    const banner = page.getByTestId('update-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveText('Mise à jour disponible, cliquez');
    await expectUsableLayout(page, 'update banner');
    await expectNoHorizontalOverflow(page, 'update banner');
    await expectContrast(page, 'update banner');
    await page.screenshot({ path: `e2e/screenshots/update-banner-${size.name}.png` });

    // version and changelog live in the profile
    await page.getByTestId('avatar').click();
    await expect(page.getByTestId('app-version')).toContainText(pkg.version);
    await page.getByTestId('open-changelog').click();
    await expect(page.getByTestId('changelog-modal')).toContainText(`Version ${pkg.version}`);
    await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && (a.effect as KeyframeEffect).target?.closest('.kit-modal-wrap')));
    await expectUsableLayout(page, 'changelog');
    await expectNoHorizontalOverflow(page, 'changelog');
    await expectContrast(page, 'changelog');
    await page.screenshot({ path: `e2e/screenshots/update-changelog-${size.name}.png` });
    expect(errors).toEqual([]);
  });
}

test('no version check by default in dev', async ({ page }) => {
  const errors = watchConsole(page);
  let asked = 0;
  await page.route('**/version.json', (route) => {
    asked++;
    return route.fulfill({ json: { version: '9.9.9' } });
  });
  await page.goto('/');
  await page.waitForTimeout(500);
  expect(asked).toBe(0);
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
  expect(errors).toEqual([]);
});
