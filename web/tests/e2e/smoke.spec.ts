import { test, expect } from '@playwright/test';

test('hello page renders with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await expect(page.locator('body')).toContainText('El nuevo panel');
  expect(errors).toEqual([]);
});
