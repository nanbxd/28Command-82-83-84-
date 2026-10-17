import { expect, test, type Page } from '@playwright/test';

test('worker requests coins, owning contractor approves, balance persists', async ({ browser, request }) => {
  test.skip(process.env.TEST_COINS !== '1', 'Requires an isolated API and TEST_COINS_ROOT_EMAIL / TEST_COINS_ROOT_PASSWORD.');
  test.setTimeout(120000);
  const api = process.env.TEST_API_URL || 'http://127.0.0.1:8000';
  const stamp = Date.now();
  const password = 'Coins browser test password 123';
  const login = async (email: string, secret = password) => {
    const response = await request.post(`${api}/api/v1/auth/login`, { data: { email, password: secret } });
    expect(response.status()).toBe(200);
    return response.json();
  };
  const root = await login(process.env.TEST_COINS_ROOT_EMAIL!, process.env.TEST_COINS_ROOT_PASSWORD!);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const create = async (token: string, role: string, name: string) => {
    const email = `coins-${role}-${name === 'Другая команда' ? 'other-' : ''}${stamp}@example.com`;
    const response = await request.post(`${api}/api/v1/staff/accounts`, { headers: auth(token), data: { email, password, role, name, phone: '+77001234567', company: 'Проверка IC-coins' } });
    expect(response.status()).toBe(201);
    return login(email);
  };
  const contractor = await create(root.access_token, 'contractor', 'Субподрядчик проверки');
  const other = await create(root.access_token, 'contractor', 'Другая команда');
  const worker = await create(contractor.access_token, 'worker', 'Работник проверки');
  const context = async (token: string) => {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(t => sessionStorage.setItem('ic-session', t), token);
    return ctx;
  };
  const workerContext = await context(worker.access_token);
  const contractorContext = await context(contractor.access_token);
  const w = await workerContext.newPage();
  const c = await contractorContext.newPage();
  let walletReads = 0;
  w.on('request', r => { if (r.url().endsWith('/api/v1/coins/wallet')) walletReads += 1; });
  const capture = async (page: Page, name: string) => {
    await page.evaluate(async () => { await document.fonts.ready; (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `../.impeccable/review/coins-live-${name}.png`, fullPage: true, animations: 'disabled' });
  };
  try {
    await w.goto('/work/ic-coins');
    await expect(w.getByTestId('coins-balance')).toHaveText(/1\s000/);
    await expect(w.getByText('Демонстрационная версия')).toHaveCount(0);
    await w.getByRole('button', { name: /Запросить бонусы/ }).click();
    const readsBeforeTyping = walletReads;
    await w.getByLabel('Комментарий для проверки', { exact: false }).pressSequentially('Проверяем обновление баланса во время ввода комментария.', { delay: 250 });
    expect(walletReads).toBeGreaterThan(readsBeforeTyping);
    await w.getByLabel('Комментарий для проверки', { exact: false }).fill('');
    await w.getByLabel('Объект и номер или время смены').fill('Офис, утренняя смена');
    await w.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect(w.getByText('Ожидает проверки', { exact: true })).toBeVisible();
    await expect(w.getByTestId('coins-balance')).toHaveText(/1\s000/);
    const pending = await request.get(`${api}/api/v1/coins/review`, { headers: auth(contractor.access_token) });
    const rid = (await pending.json()).requests[0].id;
    expect((await request.post(`${api}/api/v1/coins/requests/${rid}/review`, { headers: auth(other.access_token), data: { decision: 'approved' } })).status()).toBe(404);
    await c.goto('/contractor/ic-coins');
    await expect(c.getByRole('link', { name: 'Бонусы команды' })).toBeVisible();
    await expect(c.getByRole('article')).toHaveCount(1);
    await capture(c, 'review-desktop');
    await c.setViewportSize({ width: 390, height: 844 }); await capture(c, 'review-mobile');
    await c.setViewportSize({ width: 320, height: 844 }); await capture(c, 'review-320');
    await c.getByRole('button', { name: 'Подтвердить и начислить' }).click();
    await expect(c.getByRole('heading', { name: 'Запросов пока нет' })).toBeVisible();
    // The worker stays on the page: background polling must deliver the new balance.
    await w.bringToFront();
    await expect(w.getByTestId('coins-balance')).toHaveText(/1\s050/, { timeout: 20000 });
    expect((await request.post(`${api}/api/v1/coins/requests/${rid}/review`, { headers: auth(contractor.access_token), data: { decision: 'approved' } })).status()).toBe(200);
    await w.reload();
    await expect(w.getByTestId('coins-balance')).toHaveText(/1\s050/);
    await capture(w, 'worker-desktop');
    await w.getByRole('button', { name: /Запросить бонусы/ }).click();
    await w.getByRole('radio', { name: /Выполнил дополнительное задание/ }).check();
    await w.getByLabel('Объект и дополнительное задание').fill('Офис, вымыть окна');
    await w.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect(w.getByText('Ожидает проверки', { exact: true })).toBeVisible();
    await c.getByRole('button', { name: 'Обновить запросы' }).click();
    await expect(c.getByRole('article')).toHaveCount(1);
    await c.getByLabel('Сумма IC-coins · от 50 до 150').fill('125');
    await c.getByRole('button', { name: 'Подтвердить и начислить' }).click();
    await expect(c.getByRole('heading', { name: 'Запросов пока нет' })).toBeVisible();
    await w.getByRole('button', { name: 'Обновить баланс' }).click();
    await expect(w.getByTestId('coins-balance')).toHaveText(/1\s175/);
    await w.getByRole('radio', { name: /Прошёл обучение/ }).check();
    await w.getByLabel('Название курса').fill('Уход за напольными покрытиями');
    await w.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect(w.getByText('Ожидает проверки', { exact: true })).toBeVisible();
    await c.getByRole('button', { name: 'Обновить запросы' }).click();
    await c.getByRole('combobox', { name: /Решение/ }).selectOption('rejected');
    await c.getByLabel('Причина отказа').fill('Обучение ещё не завершено');
    await c.getByRole('button', { name: 'Отклонить запрос', exact: true }).click();
    await expect(c.getByRole('heading', { name: 'Запросов пока нет' })).toBeVisible();
    await w.getByRole('button', { name: 'Обновить баланс' }).click();
    await expect(w.getByText('Решение: Обучение ещё не завершено')).toBeVisible();
    await expect(w.getByTestId('coins-balance')).toHaveText(/1\s175/);
    await w.setViewportSize({ width: 390, height: 844 }); await capture(w, 'worker-mobile');
    await w.setViewportSize({ width: 320, height: 844 }); await capture(w, 'worker-320');
    // A rejection must not prevent completing the same course and applying again.
    await w.getByLabel('Название курса').fill('Уход за напольными покрытиями');
    await w.getByLabel('Комментарий для проверки', { exact: false }).fill('Курс завершён');
    await w.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
    await expect(w.getByText('Ожидает проверки', { exact: true })).toBeVisible();
    await c.getByRole('button', { name: 'Обновить запросы' }).click();
    await c.getByRole('button', { name: 'Подтвердить и начислить' }).click();
    await expect(c.getByRole('heading', { name: 'Запросов пока нет' })).toBeVisible();
    await w.getByRole('button', { name: 'Обновить баланс' }).click();
    await expect(w.getByTestId('coins-balance')).toHaveText(/1\s275/);
    await w.getByRole('button', { name: /Магазин/ }).click();
    const juice = w.getByRole('article', { name: 'Сок', exact: true });
    await juice.getByRole('button', { name: 'Обменять', exact: true }).click();
    await juice.getByRole('button', { name: 'Подтвердить обмен' }).click();
    await expect(w.getByTestId('coins-balance')).toHaveText('975 IC-coins');
    await expect(w.getByText('Ожидает выдачи', { exact: true })).toBeVisible();
    await w.reload(); await expect(w.getByTestId('coins-balance')).toHaveText('975 IC-coins');
  } finally {
    await workerContext.close(); await contractorContext.close();
  }
});
