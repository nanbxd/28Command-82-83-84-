export async function fillObject(page, name = 'Офис на Абая') {
  await page.getByRole('radio', { name: 'Офис', exact: true }).check();
  await page.getByLabel('Название объекта').fill(name);
  await page.getByLabel('Сегмент бизнеса').fill('Банки и финансы');
  await page.getByLabel('Город').fill('Алматы');
  await page.getByLabel('Площадь, м²').fill('1500');
  await page.getByLabel('Адрес объекта').fill('Проспект Абая, 42, 3 этаж');
}
export async function fillServices(page) {
  for (const day of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт']) await page.getByRole('checkbox', { name: `Основная уборка: ${day}`, exact: true }).check();
  await page.getByLabel('Основная уборка: начало смены').fill('08:00');
  await page.getByLabel('Основная уборка: продолжительность').fill('8');
  await page.getByLabel('Количество санузлов').fill('4');
  await page.getByLabel('Включить гигиенические материалы').check();
  await page.getByLabel('Генеральная уборка', { exact: true }).selectOption('monthly');
  await page.getByLabel('Особые пожелания').fill('Уборка переговорных до начала рабочего дня.');
}
