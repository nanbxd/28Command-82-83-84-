import { expect, test } from '@playwright/test';

test('the archive loads, a day can be selected, and the work list expands', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/cabinet');
  await expect(page.getByRole('heading', { name: 'Обзор кабинета' })).toBeVisible();
  await expect(page.getByLabel('Сводка за месяц')).toContainText('729');
  await expect(page.getByLabel('Сводка за месяц')).toContainText('705');
  await page.getByLabel('Дата работ', { exact: true }).fill('2026-09-16');
  await expect(page.getByRole('heading', { name: 'среда, 16 сентября' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Показать все работы/ })).toBeVisible();
  await page.getByRole('button', { name: /Показать все работы/ }).click();
  await expect(page.getByRole('button', { name: 'Свернуть список' })).toBeVisible();
  await expect(page.getByText('Ночная уборка', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Предыдущая неделя' }).click();
  await expect(page.getByLabel('Дата работ', { exact: true })).toHaveValue('2026-09-09');
});

test('mobile navigation, disclosure and viewport fit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cabinet');
  await expect(page.getByRole('heading', { name: 'Обзор кабинета' })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('link', { name: 'Мои объекты', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: 'Мой объект', exact: true })).toBeInViewport();
  await page.getByText('О данных демонстрации', { exact: true }).click();
  await expect(page.getByText(/Статус договора взят из портфеля/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a failed request has an actionable retry', async ({ page }) => {
  await page.route('**/api/v1/demo/overview*', route => route.abort());
  await page.goto('/cabinet');
  await expect(page.getByRole('heading', { name: 'Данные недоступны' })).toBeVisible();
  await page.unroute('**/api/v1/demo/overview*');
  await page.getByRole('button', { name: 'Попробовать ещё раз' }).click();
  await expect(page.getByRole('heading', { name: 'Обзор кабинета' })).toBeVisible();
});

test('mobile menu supports keyboard opening, traversal and Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cabinet');
  await expect(page.getByRole('heading', { name: 'Обзор кабинета' })).toBeVisible();
  const opener = page.getByRole('button', { name: 'Открыть меню' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Обзор', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Мои объекты', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await expect(opener).toHaveAttribute('aria-expanded', 'false');
});

test('a failed date change keeps the correct selected-day count and can retry', async ({ page }) => {
  await page.goto('/cabinet');
  await expect(page.getByRole('heading', { name: 'Обзор кабинета' })).toBeVisible();
  await expect(page.locator('.daily-heading')).toContainText('24 смен в плане');
  await page.route('**/api/v1/demo/overview?*', route => route.abort());
  await page.getByLabel('Дата работ', { exact: true }).fill('2026-09-03');
  await expect(page.getByRole('heading', { name: 'Данные недоступны' })).toBeVisible();
  await expect(page.locator('.daily-heading')).toContainText('25 смен в плане');
  await page.unroute('**/api/v1/demo/overview?*');
  await page.getByRole('button', { name: 'Попробовать ещё раз' }).click();
  await expect(page.getByRole('button', { name: /Показать все работы/ })).toBeVisible();
  await expect(page.locator('.daily-heading')).toContainText('25 смен в плане');
});
