import { test, expect } from '@playwright/test'

// Metadata-only fixtures: unconfirmed supplier availability must never open media.
for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }]) {
  test(`watch fits ${viewport.width}x${viewport.height} opens the main provider without claiming availability`, async ({ page }) => {
    await page.setViewportSize(viewport)
    let frames = 0
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.hostname === 'api.themoviedb.org') {
        const json = url.pathname.includes('/season/') ? { episodes: [1, 2].map(number => ({ id: 100 + number, episode_number: number, name: `Episódio local ${number}`, overview: 'Teste.', runtime: 30 })) }
          : { id: 99001, name: 'Série local de teste', first_air_date: '2026-01-01', overview: 'Sinopse completa para a verificação local da tela, sem carregar conteúdo audiovisual.', poster_path: '/poster.jpg', genres: [{ id: 18, name: 'Drama' }], seasons: [{ id: 1, season_number: 1, name: 'Temporada 1', episode_count: 2 }], credits: { cast: [{ name: 'Pessoa de teste', character: 'Personagem de teste' }] } }
        await route.fulfill({ json })
      } else if (url.hostname === 'myembed.biz') {
        frames++
        await route.fulfill({ contentType: 'text/html', body: 'Unexpected supplier request' })
      } else if (url.hostname === '127.0.0.1') await route.continue()
      else await route.abort()
    })
    await page.goto('/assistir/tmdb-tv-99001')
    await expect(page.locator('iframe')).toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(1)
    await expect(page.locator('.watch-episode-list button')).toHaveCount(2)
    await page.getByText('Ver detalhes da série', { exact: true }).click()
    await expect(page.getByText('Pessoa de teste', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Episódio local 2/ }).click()
    await expect(page).toHaveURL(/temporada=1&episodio=2$/)
    await expect(page.locator('iframe')).toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(1)
    expect(frames).toBe(2)
    expect(errors).toEqual([])
  })
}
