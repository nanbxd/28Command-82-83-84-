import { expect, test } from '@playwright/test';

test('requests expose the complete multi-object questionnaire and retain status changes', async ({ page }) => {
  await page.goto('/demo/admin');
  await expect(page).toHaveURL(/\/demo\/admin\/requests$/);
  await page.getByLabel('Город', { exact: true }).selectOption('Астана');
  await page.getByLabel('Статус', { exact: true }).selectOption('new');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Открыть заявку З-0007' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Объекты клиента · 2' })).toBeVisible();
  await expect(dialog.getByText('Магазин · второй этаж', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Поддерживающая уборка', { exact: true })).toHaveCount(2);
  await expect(dialog.getByText('580 000 ₸', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Взять в работу' }).click();
  await expect(dialog.getByText('В работе', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Открыть заявку З-0007' }).click();
  await expect(page.getByRole('dialog').getByText('В работе', { exact: true })).toBeVisible();
});

test('search has a reset and CSV export respects the filtered list', async ({ page }) => {
  await page.goto('/demo/admin/requests');
  await page.getByRole('textbox', { name: 'Поиск по текущему разделу' }).fill('несуществующий');
  await expect(page.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Экспорт CSV' })).toBeDisabled();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.getByRole('textbox', { name: 'Поиск по текущему разделу' }).fill('Орбита');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт CSV' }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const content = Buffer.concat(chunks).toString('utf8');
  expect(content).toContain('Орбита Бизнес');
  expect(content).not.toContain('Aspan Retail');
  expect(content).toContain("'+7 (000)");
});

test('projects use the workbook checklist, keep general cleaning separate, and show agreement/documents', async ({ page }) => {
  await page.goto('/demo/admin/projects');
  await page.getByRole('button', { name: 'Магазин «Вента» · ТРЦ «Норд»', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('190 чел.-мин', { exact: true })).toBeVisible();
  await expect(dialog.getByText('360 чел.-мин', { exact: true })).toBeVisible();
  await dialog.locator('summary').filter({ hasText: 'Торговый зал: пол, урны' }).click();
  await expect(dialog.locator('details[open]').getByText('Помой пол и протри плинтусы', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Фото ещё не загружено', { exact: true })).toHaveCount(2);
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Скачать отчёт CSV' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('П-001-report.csv');
  await dialog.getByRole('button', { name: 'Смета и условия' }).click();
  await expect(dialog.getByText('2 × 3 часа = 6 человеко-часов', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Профессиональный пылесос', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Документы', exact: true }).click();
  await expect(dialog.getByText('Файл договора не опубликован', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Не отправлена', { exact: true })).toBeVisible();
});

test('complaints reach IC Group first; forwarding is explicit and the original survives replies', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.goto('/demo/admin/complaints');
  await page.getByRole('button', { name: 'Открыть возражение В-0004' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Обращение поступило только в IC Group', { exact: true })).toBeVisible();
  const original = await dialog.locator('blockquote').innerText();
  await dialog.getByRole('button', { name: 'Взять на рассмотрение' }).click();
  await expect(dialog.getByText('Обращение поступило только в IC Group', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Передать исполнителю', exact: true }).click();
  await expect(dialog.getByText('Обращение поступило только в IC Group', { exact: true })).toBeVisible();
  await dialog.getByLabel(/Кому передать по объекту/).selectOption('team');
  await dialog.getByRole('button', { name: 'Подтвердить передачу' }).click();
  await expect(dialog.getByText('Передано исполнителям', { exact: true })).toBeVisible();
  await dialog.getByLabel('Сообщите, как решается вопрос').fill('Проверим стекло повторно и сообщим результат.');
  await dialog.getByRole('button', { name: 'Сохранить ответ' }).click();
  await expect(dialog.locator('blockquote')).toHaveText(original);
  await expect(dialog.getByText('Проверим стекло повторно и сообщим результат.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Открыть возражение В-0004' }).click();
  await expect(dialog.getByText('Передано исполнителям', { exact: true })).toBeVisible();
  await expect(dialog.locator('blockquote')).toHaveText(original);
  await expect(dialog.locator('.ad-timeline li')).toHaveCount(4);
  expect(apiRequests).toEqual([]);
});

test('drawer keeps keyboard focus inside and returns focus after Escape', async ({ page }) => {
  await page.goto('/demo/admin/requests');
  const opener = page.getByRole('button', { name: 'Открыть заявку З-0008' });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Закрыть карточку' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test('invalid local storage recovers; unavailable writes are reported honestly', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ic-group.admin-demo.v1', '{broken');
    Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
  });
  await page.goto('/demo/admin/requests');
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.getByRole('button', { name: 'Открыть заявку З-0008' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Взять в работу' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Хранилище недоступно');
});

for (const width of [390, 320]) {
  test(`all tabs and an open drawer fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/demo/admin/requests');
    const nav = page.getByRole('navigation', { name: 'Разделы кабинета IC Group' });
    for (const label of ['Входящие заявки', 'Активные проекты', 'Возражения']) {
      await nav.getByRole('link', { name: new RegExp(label) }).click();
      await expect(page.getByRole('heading', { name: new RegExp(label), level: 2 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole('button', { name: 'Открыть возражение В-0004' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Закрыть карточку' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
}

test('existing client route remains available after the admin styles have loaded', async ({ page }) => {
  await page.route('**/api/v1/demo/overview*', route => route.abort());
  await page.goto('/demo/admin/requests');
  await expect(page.getByRole('heading', { name: 'Рабочий кабинет.' })).toBeVisible();
  await page.evaluate(() => { history.pushState({}, '', '/demo/cabinet'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { name: 'Данные недоступны' })).toBeVisible();
  await expect(page.locator('.ic-admin')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Попробовать ещё раз' })).toBeVisible();
});
