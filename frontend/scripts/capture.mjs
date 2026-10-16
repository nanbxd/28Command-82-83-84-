import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('../.impeccable/review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
async function capture(file) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(output, file), fullPage: true });
}
page.on('pageerror', error => errors.push(error.message));
await page.goto((process.env.TEST_BASE_URL || 'http://127.0.0.1:5173') + '/demo/cabinet');
await page.getByRole('heading', { name: 'Обзор кабинета' }).waitFor();
await page.evaluate(() => document.fonts.ready);
await capture('desktop.png');
const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
await page.getByRole('button', { name: /Показать все работы/ }).click();
await capture('desktop-expanded.png');
await page.getByRole('button', { name: 'Свернуть список' }).click();
await page.setViewportSize({ width: 1280, height: 900 });
await capture('desktop-1280.png');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.scrollTo(0, 0));
await capture('mobile.png');
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
await page.getByRole('button', { name: 'Открыть меню' }).click();
await capture('mobile-menu.png');
await page.getByRole('button', { name: 'Закрыть меню' }).click();
await page.route('**/api/v1/demo/overview*', route => route.abort());
await page.reload();
await page.getByRole('heading', { name: 'Данные недоступны' }).waitFor();
await capture('mobile-error.png');
console.log(JSON.stringify({ errors, desktopOverflow, mobileOverflow, output }));
await browser.close();
