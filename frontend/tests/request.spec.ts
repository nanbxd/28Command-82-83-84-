import { expect, test, type Page } from '@playwright/test';

async function fillObject(page: Page, name = 'Офис тестирования') {
  await page.getByRole('radio', { name: 'Офис', exact: true }).check();
  await page.getByLabel('Название объекта').fill(name);
  await page.getByLabel('Сегмент бизнеса').fill('Банки и финансы');
  await page.getByLabel('Город').fill('Алматы');
  await page.getByLabel('Площадь, м²').fill('1500');
  await page.getByLabel('Адрес объекта').fill('Тестовый адрес, 10');
}
async function fillServices(page: Page) {
  await page.getByRole('checkbox', { name: 'Основная уборка: Пн', exact: true }).check();
  await page.getByLabel('Основная уборка: начало смены').fill('20:00');
  await page.getByLabel('Основная уборка: продолжительность').fill('8');
  await page.getByLabel('Количество санузлов').fill('4');
}
async function toReview(page: Page) {
  await page.goto('/'); await fillObject(page);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await fillServices(page);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
}

test('guest draft survives reload and registration, retry after lost response creates one request', async ({ page }) => {
  await toReview(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Всё готово к отправке' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Офис тестирования' })).toBeVisible();
  await page.getByRole('button', { name: 'Зарегистрироваться и продолжить' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ваше имя').fill('Проверка интерфейса');
  await dialog.getByLabel('Компания').fill('Тестовая компания UI');
  await dialog.getByLabel('Телефон').fill('+77001234567');
  await dialog.getByLabel('Email', { exact: true }).fill(`ui-${Date.now()}@example.com`);
  await dialog.getByLabel('Пароль', { exact: true }).fill('Test password 12345');
  await dialog.getByRole('button', { name: 'Создать аккаунт' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Контакты для IC Group' })).toBeVisible();
  await page.route('**/api/v1/requests', async route => { if (route.request().method() === 'POST') { await route.fetch(); await route.abort(); } else await route.continue(); }, { times: 1 });
  await page.getByRole('button', { name: 'Отправить заявку', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось связаться');
  await page.getByRole('button', { name: 'Отправить заявку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Заявка отправлена', exact: true })).toBeVisible();
  await expect(page.getByText('Тестовый адрес, 10', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Все мои заявки' }).click();
  await expect(page.locator('.submitted-request')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.submitted-request')).toHaveCount(1);
  await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
  await expect(page.getByRole('heading', { name: 'Войдите, чтобы увидеть заявки' })).toBeVisible();
  await expect(page.locator('.submitted-request')).toHaveCount(0);
});

test('each object needs its own details and service schedule', async ({ page }) => {
  await page.goto('/'); await fillObject(page, 'Первый офис');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await fillObject(page, 'Второй офис');
  await page.getByLabel('Город').fill('Астана');
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await fillServices(page);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Объект 2');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('alert')).toBeInViewport();
  await fillServices(page);
  await page.getByRole('button', { name: 'Добавить позицию' }).click();
  await page.getByLabel('Должность', { exact: true }).fill('Уборщик помещений');
  await page.getByRole('checkbox', { name: 'Позиция 1: Вт', exact: true }).check();
  await page.getByLabel('Позиция 1: начало смены').fill('10:00');
  await page.getByLabel('Позиция 1: продолжительность').fill('4');
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Первый офис', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Второй офис', exact: true })).toBeVisible();
  await expect(page.getByText('Уборщик помещений × 1 · Вт · с 10:00, 4 ч')).toBeVisible();
});

test('mobile auth is keyboard accessible and cancellation retains the form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await toReview(page);
  const opener = page.getByRole('button', { name: 'Зарегистрироваться и продолжить' });
  await opener.click();
  await expect(page.getByRole('dialog').getByLabel('Ваше имя')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Офис тестирования' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('wrong password shows a recoverable error without discarding the draft', async ({ page }) => {
  await toReview(page);
  await page.getByRole('button', { name: 'Войти', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email', { exact: true }).fill(`missing-${Date.now()}@example.com`);
  await dialog.getByLabel('Пароль', { exact: true }).fill('wrong password');
  await dialog.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Неверный email или пароль.');
  await dialog.getByRole('button', { name: 'Закрыть окно' }).click();
  await expect(page.getByRole('heading', { name: 'Офис тестирования' })).toBeVisible();
});

test('missing days on a long mobile form focuses the visible error', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await fillObject(page);
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByLabel('Основная уборка: начало смены').fill('08:00');
  await page.getByLabel('Основная уборка: продолжительность').fill('8');
  await page.getByLabel('Количество санузлов').fill('2');
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Укажите дни');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('alert')).toBeInViewport();
  await page.screenshot({ path: '../.impeccable/review/validation-mobile.png' });
});

test('edited retry explains the conflict and only starts a second request after explicit action', async ({ page }) => {
  await toReview(page);
  const registration = await page.request.post('/api/v1/auth/register', { data: { email: `conflict-${Date.now()}@example.com`, password: 'Verification password 42', name: 'Проверка восстановления', company: 'Тестовая компания', phone: '+77001234567' } });
  expect(registration.status()).toBe(201);
  const session = await registration.json();
  await page.evaluate(token => sessionStorage.setItem('ic-session', token), session.access_token);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Контакты для IC Group' })).toBeVisible();
  await page.route('**/api/v1/requests', async route => { await route.fetch(); await route.abort(); }, { times: 1 });
  await page.getByRole('button', { name: 'Отправить заявку', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось связаться');
  await page.getByLabel('Бюджет в месяц').fill('200000');
  await page.getByRole('button', { name: 'Отправить заявку', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Предыдущая версия');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('link', { name: 'Посмотреть мои заявки' })).toBeVisible();
  await page.screenshot({ path: '../.impeccable/review/conflict-desktop.png' });
  await page.getByRole('button', { name: 'Создать новую заявку с этими параметрами' }).click();
  await expect(page.getByLabel('Бюджет в месяц')).toHaveValue('200000');
  await expect(page.getByRole('heading', { name: 'Офис тестирования', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Отправить заявку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Заявка отправлена', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Все мои заявки' }).click();
  await expect(page.locator('.submitted-request')).toHaveCount(2);
});
