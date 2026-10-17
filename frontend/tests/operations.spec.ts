import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const api = process.env.TEST_API_URL || 'http://127.0.0.1:8000';
const root = path.resolve(import.meta.dirname, '../..');
const password = 'Operations test password 123';
const photo = { name: 'integration-photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAT0lEQVR4nO3NMQHAMBDEsI+BlWNRlVbXHAFnyImA1vs9cwJH1mkswsx2jTV4VWqswatSYw1elRpr8KrUWINXpcYavCo11uBVqbEGr5rL4x8CLgHmP+SCFQAAAABJRU5ErkJggg==', 'base64') };
async function session(page: Page, token: string) { await page.addInitScript(value => sessionStorage.setItem('ic-session', value), token); }
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy(); }

async function capture(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main [role="status"]').filter({ hasText: /^Загружаем данные/ })).toHaveCount(0);
  const photos = page.locator('.portal-photo');
  const count = await photos.count();
  if (count) {
    await expect(photos.locator('img')).toHaveCount(count);
    await expect.poll(() => photos.locator('img').evaluateAll(images => images.every(img => { (img as HTMLImageElement).loading = 'eager'; return (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0; }))).toBeTruthy();
  }
  await page.evaluate(async () => { await document.fonts.ready; (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) await dialog.evaluate(element => element.scrollTo(0, 0));
  await page.screenshot({ path: `../.impeccable/review/${name}`, fullPage: !(await dialog.count()), animations: 'disabled' });
}

test('guest gates, empty client cabinet, removed examples, recoverable loading error', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Вход для сотрудников IC Group' })).toBeVisible();
  const email = `ops-empty-${Date.now()}@example.com`;
  const account = await request.post(`${api}/api/v1/auth/register`, { data: { email, password, name: 'Проверка пустого кабинета', phone: '+77001234567', company: 'Проверка изоляции' } });
  expect(account.status()).toBe(201);
  const user = await account.json(); await session(page, user.access_token);
  await page.goto('/cabinet'); await expect(page.getByRole('heading', { name: 'Объектов пока нет' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 }); await noOverflow(page);
  await page.goto('/admin'); await expect(page.getByRole('heading', { name: 'Этот кабинет недоступен для вашей роли' })).toBeVisible();
  expect((await request.get(`${api}/api/v1/staff/requests`, { headers: { Authorization: `Bearer ${user.access_token}` } })).status()).toBe(403);
  await page.goto('/demo/admin'); await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  await page.route('**/api/v1/projects?*', route => route.abort());
  await page.goto('/cabinet'); await expect(page.getByRole('heading', { name: 'Не удалось загрузить данные' })).toBeVisible();
  await page.unroute('**/api/v1/projects?*');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Объектов пока нет' })).toBeVisible();
});

test('real accounts, request to object, worker photos, client documents and complaint', async ({ page, request, browser }) => {
  test.setTimeout(240000);
  test.skip(process.env.TEST_OPERATIONS !== '1', 'Explicit local operations test required.');
  // Credentials stay inside the test process; never print or attach the environment.
  const env = Object.fromEntries(readFileSync(path.join(root, 'backend/.env'), 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const rootLogin = await request.post(`${api}/api/v1/auth/login`, { data: { email: env.SUPERADMIN_EMAIL, password: env.SUPERADMIN_PASSWORD } });
  expect(rootLogin.status()).toBe(200); const rootSession = await rootLogin.json();
  const localInput = (offset: number) => new Date(Date.now() + (5 * 60 + offset) * 60000).toISOString().slice(0, 16);
  const suffix = Date.now(); const adminEmail = `ops-admin-${suffix}@example.com`; const workerEmail = `ops-worker-${suffix}@example.com`;
  const complaintTitle = `Проверка обработки замечания ${suffix}`;
  await session(page, rootSession.access_token); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/admin/accounts');
  for (const [role, email, name] of [['manager', adminEmail, 'Администратор проверки']]) {
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    const dialog = page.getByRole('dialog'); await dialog.getByLabel('Роль', { exact: true }).selectOption(role);
    if (role === 'manager') await capture(page, 'operations-account-form.png');
    await dialog.getByLabel('Имя', { exact: true }).fill(name); await dialog.getByLabel('Email', { exact: true }).fill(email);
    await dialog.getByLabel('Телефон', { exact: true }).fill('+77001234567'); await dialog.getByLabel('Пароль · минимум 12 символов').fill(password);
    await dialog.getByRole('button', { name: 'Создать аккаунт', exact: true }).click(); await expect(page.getByText(email, { exact: true })).toBeVisible();
  }
  await capture(page, 'operations-accounts-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page); await capture(page, 'operations-accounts-mobile.png');
  expect(await page.locator('.portal-table').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  for (const button of await page.getByRole('row').filter({ hasText: adminEmail }).getByRole('button').all()) {
    const box = await button.boundingBox(); expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  const login = async (email: string) => { const r = await request.post(`${api}/api/v1/auth/login`, { data: { email, password } }); expect(r.status()).toBe(200); return r.json(); };
  const admin = await login(adminEmail);
  const contractorEmail = `ops-contractor-${suffix}@example.com`;
  const createAccount = async (token: string, role: string, email: string) => {
    const response = await request.post(`${api}/api/v1/staff/accounts`, { headers: { Authorization: `Bearer ${token}` }, data: { role, email, password, name: 'Исполнитель проверки', phone: '+77001234567', company: 'Проверка обслуживания' } });
    expect(response.status()).toBe(201);
  };
  await createAccount(admin.access_token, 'contractor', contractorEmail);
  const contractor = await login(contractorEmail);
  await createAccount(contractor.access_token, 'worker', workerEmail);
  const worker = await login(workerEmail);
  const clientResponse = await request.post(`${api}/api/v1/auth/register`, { data: { email: `ops-client-${suffix}@example.com`, password, name: 'Клиент проверки', phone: '+77001234567', company: 'Компания проверки обслуживания' } });
  expect(clientResponse.status()).toBe(201); const client = await clientResponse.json();
  const schedule = { days: [1, 3, 5], start_time: '08:00', duration_hours: 2 };
  const submitted = await request.post(`${api}/api/v1/requests`, { headers: { Authorization: `Bearer ${client.access_token}` }, data: { idempotency_key: `operations-test-${suffix}`, details: { objects: [{ object_type: 'office', segment: 'Офисы', name: 'Офис проверки обслуживания', city: 'Алматы', address: 'Адрес интеграционной проверки, 10', area_sqm: 350, base_schedule: schedule, support_positions: [], bathrooms: 2, hygiene_materials: true, general_cleaning: 'monthly', notes: 'Проверка полного рабочего пути' }], monthly_budget: null, desired_start: null } } });
  expect(submitted.status()).toBe(201); const source = await submitted.json();
  const adminContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height: 1000 } });
  const workerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 } });
  const clientContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height: 1000 } });
  try {
    const staff = await adminContext.newPage(); await session(staff, admin.access_token); await staff.goto('/admin/requests');
    await staff.getByRole('searchbox', { name: 'Поиск по текущему разделу' }).fill(source.id);
    await staff.getByRole('button', { name: `Открыть заявку ${source.id}` }).click();
    await staff.getByRole('button', { name: 'Создать объекты' }).click();
    await expect(staff.getByRole('button', { name: 'Создать объекты', exact: true })).toHaveCount(0);
    await staff.getByRole('button', { name: 'Закрыть карточку' }).click();
    await staff.getByRole('button', { name: `Открыть заявку ${source.id}` }).click();
    await expect(staff.getByRole('link', { name: 'Офис проверки обслуживания →' })).toBeVisible();
    await expect(staff.getByRole('button', { name: 'Создать объекты', exact: true })).toHaveCount(0);
    await staff.getByRole('link', { name: 'Офис проверки обслуживания →' }).click();
    await expect(staff.getByRole('heading', { name: 'Офис проверки обслуживания.' })).toBeVisible(); const projectUrl = staff.url(); const projectId = projectUrl.split('/').at(-1)!;
    await staff.getByRole('button', { name: 'Изменить условия' }).click(); const conditions = staff.getByRole('dialog');
    await conditions.getByLabel('Статус объекта').selectOption('active'); await conditions.getByLabel('План работ').fill('Уборка полов и санузлов. Контроль качества после каждой смены.');
    await conditions.getByLabel('Номер договора').fill('TEST-2026'); await conditions.getByLabel('Цена за месяц с НДС, ₸').fill('120000'); await conditions.getByLabel('Условия оплаты').fill('По согласованному договору');
    await conditions.getByRole('button', { name: 'Сохранить условия' }).click(); await expect(conditions).not.toBeVisible();
    await expect(staff.getByRole('button', { name: 'Назначить уборку', exact: true })).toHaveCount(0);
    const assigned = await request.put(`${api}/api/v1/staff/projects/${projectId}/contractor`, { headers: { Authorization: `Bearer ${admin.access_token}` }, data: { contractor_id: contractor.user.id } });
    expect(assigned.status()).toBe(200);
    const planned = await request.post(`${api}/api/v1/projects/${projectId}/runs`, { headers: { Authorization: `Bearer ${contractor.access_token}` }, data: { name: 'Проверка уборки', assignments: [{ zone: 'Полы и санузлы', worker_id: worker.user.id, planned_start: `${localInput(-1)}:00+05:00`, planned_end: `${localInput(59)}:00+05:00`, checklist: ['Убрать полы', 'Убрать санузлы'] }] } });
    expect(planned.status()).toBe(201); const cleaningRun = await planned.json();
    expect((await request.post(`${api}/api/v1/invitations/${cleaningRun.id}/respond`, { headers: { Authorization: `Bearer ${worker.access_token}` }, data: { decision: 'accept' } })).status()).toBe(200);
    const executor = await workerContext.newPage(); await session(executor, worker.access_token); await executor.goto(`/work/projects/${projectId}`);
    const upload = async (who: Page, label: RegExp) => { const input = who.getByLabel(label); await input.setInputFiles(photo); const form = input.locator('xpath=ancestor::form'); await form.getByRole('button', { name: 'Загрузить файл' }).click(); await expect(form.getByRole('status')).toContainText('Файл сохранён.'); };
    await upload(executor, /^До уборки ·/); await executor.getByRole('button', { name: 'Начать уборку', exact: true }).click();
    await expect(executor.getByRole('button', { name: 'Завершить и отправить отчёт' })).toBeVisible();
    await executor.getByLabel('Убрать полы', { exact: true }).check(); await executor.getByLabel('Убрать санузлы', { exact: true }).check(); await executor.getByLabel('Комментарий к отчёту').fill('Проверка сохранения чек-листа при загрузке фото.');
    await upload(executor, /^После уборки ·/); await expect(executor.getByLabel('Убрать полы', { exact: true })).toBeChecked();
    await capture(executor, 'operations-worker-mobile.png');
    await executor.getByRole('button', { name: 'Завершить и отправить отчёт' }).click(); await expect(executor.getByText('Отчёт на проверке', { exact: true })).toBeVisible(); await noOverflow(executor);
    expect((await request.post(`${api}/api/v1/runs/${cleaningRun.id}/complete`, { headers: { Authorization: `Bearer ${contractor.access_token}` } })).status()).toBe(200); await staff.reload(); await expect(staff.getByRole('button', { name: 'Принять отчёт', exact: true })).toHaveCount(0); await expect(staff.getByText('Отчёт принят', { exact: true }).first()).toBeVisible();
    await staff.getByRole('button', { name: 'Договоры и АВР' }).click(); await staff.getByLabel(/^Договор · PDF/).setInputFiles({ name: 'Договор проверки.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nIntegration test document\n%%EOF') });
    await staff.getByRole('button', { name: 'Загрузить файл' }).click(); await expect(staff.getByRole('heading', { name: 'Договор проверки.pdf' })).toBeVisible();
    const customer = await clientContext.newPage(); await session(customer, client.access_token); await customer.goto(`/cabinet/projects/${projectId}`);
    await expect(customer.getByText('Отчёт принят', { exact: true }).first()).toBeVisible(); await expect(customer.locator('.portal-photo img')).toHaveCount(2); await expect(customer.getByLabel('Убрать полы')).toBeChecked();
    await expect(customer.locator('.portal-photo img').first()).toBeVisible(); await capture(customer, 'operations-client-desktop.png');
    await expect(customer.locator('.portal-heading .ad-eyebrow')).toHaveCount(0);
    await expect(customer.locator('.ad-facts dt').first()).toHaveCSS('color', 'rgb(98, 104, 97)');
    await customer.setViewportSize({ width: 390, height: 844 }); await noOverflow(customer); await capture(customer, 'operations-client-mobile.png');
    await customer.setViewportSize({ width: 320, height: 900 }); await noOverflow(customer); await capture(customer, 'operations-client-320.png');
    await customer.getByRole('button', { name: 'Договоры и АВР' }).click(); await expect(customer.getByRole('heading', { name: 'Договор проверки.pdf' })).toBeVisible();
    await capture(customer, 'operations-documents-mobile.png');
    const download = customer.waitForEvent('download'); await customer.getByRole('button', { name: 'Скачать', exact: true }).click(); expect((await download).suggestedFilename()).toBe('Договор проверки.pdf');
    await customer.getByRole('button', { name: 'Сообщить о качестве' }).click(); await customer.getByLabel('Тема', { exact: true }).fill(complaintTitle); await customer.getByLabel('Что нужно исправить').fill('Пожалуйста, проверьте качество уборки в санузле.'); await customer.getByRole('button', { name: 'Отправить обращение' }).click(); await customer.getByRole('link', { name: 'Мои обращения' }).click(); await expect(customer.getByText(complaintTitle)).toBeVisible();
    await executor.goto('/work/complaints'); await expect(executor.getByRole('heading', { name: 'Обращений пока нет' })).toBeVisible();
    await staff.goto('/admin/complaints'); await staff.getByRole('button', { name: new RegExp(complaintTitle) }).click(); await staff.getByLabel('Статус обращения').selectOption('correction'); await staff.getByLabel('Передать исполнителю').selectOption(worker.user.id); await staff.getByLabel('Сообщение', { exact: true }).fill('Проверьте качество и сообщите результат.'); await staff.getByRole('button', { name: 'Отправить ответ' }).click(); await expect(staff.getByLabel('Сообщение', { exact: true })).toHaveValue(''); await expect(staff.locator('.portal-thread')).toContainText('Проверьте качество и сообщите результат.');
    await capture(staff, 'operations-complaint-desktop.png'); await staff.setViewportSize({ width: 390, height: 844 }); await noOverflow(staff); await capture(staff, 'operations-complaint-mobile.png'); await staff.setViewportSize({ width: 1440, height: 1000 });
    await executor.reload(); await expect(executor.getByText(complaintTitle)).toBeVisible();
    await staff.getByRole('button', { name: 'Закрыть карточку' }).click(); await staff.goto(projectUrl); await capture(staff, 'operations-staff-desktop.png');
    await staff.setViewportSize({ width: 390, height: 844 }); await noOverflow(staff); await capture(staff, 'operations-staff-mobile.png');
    await customer.goto('/cabinet/projects'); await expect(customer.locator('.portal-project')).toHaveCount(1); await capture(customer, 'operations-list-mobile.png');
  } finally { await adminContext.close(); await workerContext.close(); await clientContext.close(); }
});
