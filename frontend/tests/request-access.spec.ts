import { test, expect } from '@playwright/test';

for (const [role, home] of [['manager', '/admin/requests'], ['superadmin', '/admin/requests'], ['contractor', '/contractor/projects'], ['worker', '/work/projects']]) {
  test(`${role} cannot open client request forms`, async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('ic-session', 'test-role-session'));
    await page.route('**/api/v1/**', route => route.fulfill({ json: route.request().url().endsWith('/auth/me')
      ? { id: 'role-test', role, name: 'Test account', email: 'test@example.com', company: 'Test', phone: '' } : [] }));
    for (const path of ['/', '/requests', '/requests/test-id']) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${home}$`));
      await expect(page.getByRole('link', { name: 'Новая заявка' })).toHaveCount(0);
      await expect(page.locator('.request-form')).toHaveCount(0);
    }
  });
}

test('guest and client can open the request form', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.request-form')).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('ic-session', 'test-client-session'));
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { id: 'client-test', role: 'client', name: 'Test client', email: 'client@example.com', company: 'Test', phone: '' } }));
  await page.reload();
  await expect(page.locator('.request-form')).toBeVisible();
});
