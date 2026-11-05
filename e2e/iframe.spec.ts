import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('diagnostic is separate, unlicensed IDs never contact EmbedWave, licensed fixture plays', async ({ page }, info) => {
  const vendorRequests: string[] = []
  page.on('request', request => { if (new URL(request.url()).hostname === 'embedwave.cc') vendorRequests.push(request.url()) })
  await page.goto('/diagnostico/reproducao', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1, name: 'Diagnóstico de fornecedores.' })).toBeVisible()
  await page.getByLabel('ID TMDB').fill('42')
  await page.getByRole('button', { name: 'Verificar direitos e disponibilidade' }).click()
  await expect(page.getByTestId('rights-result')).toContainText('license-missing')
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByRole('button', { name: 'Testar iframe com curta autorizado' }).click()
  await expect(page.getByTestId('frame-status')).toHaveAttribute('data-status', 'ready')
  const frame = page.frameLocator('iframe')
  await frame.getByRole('button', { name: 'Reproduzir amostra autorizada' }).click()
  await expect(page.getByTestId('frame-status')).toHaveAttribute('data-status', 'playing', { timeout: 25000 })
  await expect.poll(() => frame.locator('video').evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 25000 }).toBeGreaterThan(1)
  expect(await page.evaluate(() => document.querySelector('iframe')?.contentDocument)).toBeNull()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false)
  expect(vendorRequests).toEqual([])
  await page.screenshot({ path: `test-results/diagnostic-${info.project.name}.png`, fullPage: true })
})

for (const [name, headers, errorPattern] of [
  ['x-frame-options', { 'X-Frame-Options': 'DENY' }, /x-frame-options/i],
  ['frame-ancestors', { 'Content-Security-Policy': "frame-ancestors 'none'" }, /frame-ancestors/i],
] as const) {
  test(`honors ${name} on a controlled local response without bypass`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const html = await readFile('public/diagnostics/licensed-frame.html', 'utf8')
    await page.route('**/diagnostics/licensed-frame.html*', route => route.fulfill({ status: 200, contentType: 'text/html', headers, body: html }))
    await page.goto('/diagnostico/reproducao', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Testar iframe com curta autorizado' }).click()
    await expect(page.getByTestId('frame-status')).toHaveAttribute('data-status', 'unconfirmed', { timeout: 16000 })
    expect(errors.some(error => errorPattern.test(error))).toBe(true)
    await expect(page.getByRole('link', { name: 'Usar demonstração autorizada' })).toBeVisible()
    const permissions = await page.locator('iframe').getAttribute('sandbox')
    expect(permissions).toBe('allow-scripts')
  })
}
