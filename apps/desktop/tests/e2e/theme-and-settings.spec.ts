import { test, expect } from './fixtures/electron-app'

// Flow 7 of 8 (`phase-16-testing.md`): theme switch (dark ↔ light) + settings change.

test('Ctrl+, opens Settings, and switching theme updates the real document attribute', async ({
  window,
}) => {
  await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark') // default

  await window.keyboard.press('Control+,')
  await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await window.getByRole('button', { name: 'Light' }).click()

  // Real CSS custom-property swap — `readPersistedTheme()`/`main.tsx` apply this to the actual
  // document root, not a component-local state flag.
  await expect(window.locator('html')).toHaveAttribute('data-theme', 'light')

  await window.getByRole('button', { name: 'Dark' }).click()
  await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('the editor font size setting is a real, editable field', async ({ window }) => {
  await window.keyboard.press('Control+,')
  await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible()

  const fontSizeInput = window.getByLabel('Font size')
  await expect(fontSizeInput).toBeVisible()
  const initialValue = await fontSizeInput.inputValue()
  expect(Number(initialValue)).toBeGreaterThan(0)
})

test('closing Settings returns focus to the IDE shell', async ({ window }) => {
  await window.keyboard.press('Control+,')
  await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await window.keyboard.press('Escape')

  await expect(window.getByRole('heading', { name: 'Settings' })).not.toBeVisible()
})
