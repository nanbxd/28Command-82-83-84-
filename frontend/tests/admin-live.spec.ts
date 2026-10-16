import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const apiBase = process.env.TEST_API_URL || 'http://127.0.0.1:8000';
const root = path.resolve(import.meta.dirname, '../..');
const password = 'Integration test password 123';
const schedule = { days: [1, 3, 5], start_time: '08:00', duration_hours: 6 };
const details = {
  objects: [
    { object_type: 'office', segment: 'Финансы', name: 'Первый офис интеграции', city: 'Алматы', address: 'Тестовый адрес, 10', area_sqm: 300, base_schedule: schedule, support_positions: [], bathrooms: 2, hygiene_materials: true, general_cleaning: 'monthly', notes: 'Уборка до открытия' },
    { object_type: 'warehouse', segment: 'Логистика', name: 'Второй склад интеграции', city: 'Астана', address: 'Тестовый адрес, 20', area_sqm: 700, base_schedule: { ...schedule, days: [2, 4], start_time: '19:00' }, support_positions: [{ role: 'Дежурный уборщик', count: 2, schedule: { ...schedule, days: [6], start_time: '12:00', duration_hours: 3 } }], bathrooms: 0, hygiene_materials: false, general_cleaning: 'once', notes: 'Отдельный вход' },
  ], monthly_budget: 123456, desired_start: '2026-11-02',
};

async function register(request: APIRequestContext, kind: string) {
  const response = await request.post(`${apiBase}/api/v1/auth/register`, { data: {
    email: `merge-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`, password,
    name: 'Тест интеграции', phone: '+77001234567', company: `Компания проверки ${kind}`,
  } });
  expect(response.status()).toBe(201);
  return response.json();
}
async function session(page: Page, token: string) {
  await page.addInitScript(value => sessionStorage.setItem('ic-session', value), token);
}

test('guest and client cannot open staff requests or bypass the server role check', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Вход для сотрудников IC Group' })).toBeVisible();
  const client = await register(request, 'access');
  await session(page, client.access_token);
  const staffCalls: string[] = [];
  page.on('request', item => { if (item.url().includes('/api/v1/staff/')) staffCalls.push(item.url()); });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Кабинет доступен сотрудникам IC Group' })).toBeVisible();
  expect(staffCalls).toEqual([]);
  const denied = await request.get(`${apiBase}/api/v1/staff/requests`, { headers: { Authorization: `Bearer ${client.access_token}` } });
  expect(denied.status()).toBe(403);
  await page.getByRole('link', { name: 'Мои заявки', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Мои заявки', exact: true })).toBeVisible();
});

test('client submission reaches staff; failed update retries and the client sees the persisted status', async ({ page, request, browser }) => {
  test.skip(!process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL must identify the test API database to grant the synthetic staff account its role.');
  test.setTimeout(90000);
  const client = await register(request, 'client');
  const manager = await register(request, 'staff');
  execFileSync(process.env.TEST_PYTHON || path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python'), ['-m', 'app.create_manager', manager.user.email], {
    cwd: path.join(root, 'backend'), env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: 'pipe',
  });
  await session(page, client.access_token);
  await page.goto('/');
  // Exercise the same public form submission path with a restored, complete two-object draft.
  await page.evaluate(value => localStorage.setItem('ic-request-draft-v1', JSON.stringify({
    version: 1, key: crypto.randomUUID(), step: 2,
    monthly_budget: String(value.monthly_budget), desired_start: value.desired_start,
    objects: value.objects.map(object => ({ ...object, key: crypto.randomUUID(), area_sqm: String(object.area_sqm), bathrooms: String(object.bathrooms), base_schedule: { ...object.base_schedule, duration_hours: String(object.base_schedule.duration_hours) }, support_positions: object.support_positions.map(position => ({ ...position, key: crypto.randomUUID(), count: String(position.count), schedule: { ...position.schedule, duration_hours: String(position.schedule.duration_hours) } })) })),
  })), details);
  await page.reload();
  const sent = page.waitForResponse(response => response.url().endsWith('/api/v1/requests') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Отправить заявку', exact: true }).click();
  const submitted = await (await sent).json();
  await expect(page.getByRole('heading', { name: 'Заявка отправлена', exact: true })).toBeVisible();
  const staffContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  try {
    const staff = await staffContext.newPage();
    await session(staff, manager.access_token);
    await staff.goto('/admin/requests');
    await staff.getByRole('textbox', { name: 'Поиск по текущему разделу' }).fill(submitted.id);
    await staff.getByLabel('Город', { exact: true }).selectOption('Астана');
    await expect(staff.locator('tbody tr')).toHaveCount(1);
    await staff.screenshot({ path: '../.impeccable/review/merge-staff-desktop.png', fullPage: true });
    await staff.getByRole('button', { name: `Открыть заявку ${submitted.id}` }).click();
    const drawer = staff.getByRole('dialog');
    await expect(drawer.getByText(client.user.email, { exact: true })).toBeVisible();
    await expect(drawer.getByText('Дежурный уборщик × 2 · Сб · с 12:00, 3 ч', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Отдельный вход', { exact: true })).toBeVisible();
    await expect(drawer.getByText('2026-11-02', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Расчёт ещё не подготовлен.', { exact: false })).toBeVisible();
    await staff.route('**/api/v1/staff/requests/*', route => route.abort(), { times: 1 });
    await drawer.getByRole('button', { name: 'Взять в работу' }).click();
    await expect(drawer.getByRole('alert')).toContainText('Не удалось сохранить статус');
    await expect(drawer.locator('.ad-detail-meta')).toContainText('Новая');
    await drawer.getByRole('button', { name: 'Взять в работу' }).click();
    await expect(drawer.locator('.ad-detail-meta')).toContainText('В работе');
    await page.reload();
    await expect(page.locator('.request-status')).toHaveText('На рассмотрении');
    await drawer.getByRole('button', { name: 'Отметить связь с клиентом' }).click();
    await expect(drawer.locator('.ad-detail-meta')).toContainText('Связь установлена');
    await drawer.getByRole('button', { name: 'Закрыть заявку', exact: true }).click();
    await expect(drawer.locator('.ad-detail-meta')).toContainText('Закрыта');
    await staff.setViewportSize({ width: 390, height: 844 });
    await staff.screenshot({ path: '../.impeccable/review/merge-staff-mobile.png' });
    expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await staff.reload();
    await staff.getByRole('textbox', { name: 'Поиск по текущему разделу' }).fill(submitted.id);
    await staff.getByRole('button', { name: `Открыть заявку ${submitted.id}` }).click();
    await expect(drawer.locator('.ad-detail-meta')).toContainText('Закрыта');
    await page.reload();
    await expect(page.locator('.request-status')).toHaveText('Закрыта');
    expect(await staff.evaluate(() => localStorage.getItem('ic-group.admin-demo.v1'))).toBeNull();
    await staff.keyboard.press('Escape');
    expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await staff.getByRole('link', { name: 'На сайт', exact: true }).click();
    await expect(staff.getByRole('link', { name: 'Кабинет IC Group', exact: true })).toBeVisible();
    await staff.getByRole('button', { name: 'Выйти из аккаунта' }).click();
    await staff.goto('/admin');
    await expect(staff.getByRole('heading', { name: 'Вход для сотрудников IC Group' })).toBeVisible();
  } finally { await staffContext.close(); }
});

test('staff pagination preserves records and an expired session removes the private screen', async ({ page }) => {
  await session(page, 'synthetic-session');
  const profile = { id: 'synthetic-staff', role: 'manager', name: 'Тест', email: 'staff@example.com', phone: '+77001234567', company: 'Тест' };
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: profile }));
  const records = Array.from({ length: 51 }, (_, index) => ({ id: `IC-TEST-${index}`, status: 'new', contact: profile, payload: details, history: [], created_at: '2026-10-17T01:00:00+05:00' }));
  let expired = false;
  await page.route('**/api/v1/staff/requests?*', route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset'));
    return expired ? route.fulfill({ status: 401, json: { detail: 'Сессия истекла' } }) : route.fulfill({ json: records.slice(offset, offset + 50) });
  });
  await page.goto('/admin/requests');
  await expect(page.locator('tbody tr')).toHaveCount(50);
  await page.getByRole('button', { name: 'Загрузить ещё заявки' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(51);
  await expect(page.getByRole('button', { name: 'Загрузить ещё заявки' })).toHaveCount(0);
  expired = true;
  await page.getByRole('button', { name: 'Обновить заявки' }).click();
  await expect(page.getByRole('heading', { name: 'Вход для сотрудников IC Group' })).toBeVisible();
  await expect(page.locator('.ic-admin')).toHaveCount(0);
});
