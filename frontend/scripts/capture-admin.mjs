import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('../.impeccable/review/admin');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
for (const section of ['requests', 'projects', 'complaints']) {
  await page.goto(`${base}/demo/admin/${section}`);
  await page.getByRole('heading', { name: 'Рабочий кабинет.' }).waitFor();
  await page.locator('.ad-list-footer').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, `${section}-desktop.png`), fullPage: true });
}
await page.getByRole('button', { name: 'Открыть возражение В-0004' }).click();
await page.screenshot({ path: path.join(output, 'complaint-detail.png'), fullPage: true });
await page.keyboard.press('Escape');
await page.goto(`${base}/demo/admin/projects`);
await page.getByRole('button', { name: 'Магазин «Вента» · ТРЦ «Норд»', exact: true }).click();
await page.screenshot({ path: path.join(output, 'project-detail.png'), fullPage: true });
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/demo/admin/requests`);
await page.locator('tbody tr').first().waitFor();
await page.screenshot({ path: path.join(output, 'requests-mobile.png'), fullPage: true });
console.log(JSON.stringify({ errors, output }));
await browser.close();
if (errors.length) process.exitCode = 1;
