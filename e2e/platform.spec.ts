import { test, expect } from '@playwright/test'

const movie = { id: 91001, media_type: 'movie', title: 'Filme de teste local', release_date: '2026-01-01', overview: 'Metadados simulados para verificar a interface, sem reprodução.', poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', genre_ids: [28], vote_average: 7.5 }
const series = { id: 91002, media_type: 'tv', name: 'Série de teste local', first_air_date: '2026-01-01', overview: movie.overview, poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', genre_ids: [18], vote_average: 8.5 }

test.beforeEach(async ({ page }) => {
  // No real catalog, image, video or embedded-player request leaves the browser.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === 'api.themoviedb.org') {
      const tv = url.pathname.includes('/tv')
      const detail = /\/(movie|tv)\/\d+$/.test(url.pathname)
      let body: unknown = { results: tv ? [series] : url.pathname.includes('/movie') ? [movie] : [movie, series] }
      if (detail) body = { ...(tv ? series : movie), genres: [{ id: tv ? 18 : 28, name: tv ? 'Drama' : 'Ação' }], credits: { cast: [] }, seasons: tv ? [{ id: 1, season_number: 1, name: 'Temporada 1', episode_count: 2 }] : undefined }
      if (url.pathname.includes('/season/')) body = { episodes: [{ id: 1, episode_number: 1, name: 'Primeiro', overview: '', runtime: 20 }, { id: 2, episode_number: 2, name: 'Segundo', overview: '', runtime: 20 }] }
      if (url.pathname.includes('/search/')) body = { results: [series] }
      await route.fulfill({ json: body })
    } else if (url.hostname === 'image.tmdb.org') {
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750"><rect width="500" height="750" fill="#142d49"/></svg>' })
    } else if (url.hostname === '127.0.0.1') await route.continue()
    else await route.abort()
  })
})

test('TMDB rails, direct navigation, favorites, search and responsive layout', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(movie.title)
  for (const name of ['Em alta hoje', 'Em alta na semana', 'Filmes populares', 'Séries populares', 'Filmes de Ação']) {
    await expect(page.getByRole('heading', { name: `${name}.`, exact: true })).toBeVisible()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false)
  await expect(page.locator('.hero-play')).toHaveAttribute('href', '/assistir/tmdb-movie-91001')
  await expect(page.getByText(/Cinema aberto|Big Buck Bunny|Sintel/)).toHaveCount(0)
  const track = page.locator('.carousel').first()
  await track.evaluate(el => { el.scrollLeft = el.scrollWidth })
  await page.screenshot({ path: `test-results/catalog-${info.project.name}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Minha lista', exact: true }).click()
  await page.goto('/minha-lista')
  await expect(page.locator('.card-title')).toHaveText(movie.title)
  await page.reload()
  await expect(page.locator('.card-title')).toHaveText(movie.title)
  await page.goto('/buscar?q=serie')
  await expect(page.locator('.card-title')).toHaveText(series.name)
  await page.getByLabel('Tipo de conteúdo').selectOption('movie')
  await expect(page.getByRole('heading', { name: 'Essa história ainda não apareceu' })).toBeVisible()
  expect(errors).toEqual([])
})

test('resume is the first horizontal rail, links to the saved episode and keeps old data hidden', async ({ page }, info) => {
  await page.addInitScript(() => {
    const media = { id: 'tmdb-tv-91002', title: 'Série de teste local', kind: 'tv', year: 2026, genres: ['Drama'], genreIds: [18], rating: 8, overview: '', cast: [], source: 'tmdb', poster: 'https://image.tmdb.org/t/p/w500/poster.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg' }
    const progress: Record<string, unknown> = {}
    for (let number = 0; number < 4; number++) {
      const item = { ...media, id: `tmdb-tv-${91002 + number}`, title: number ? `Título salvo ${number}` : media.title }
      progress[`${item.id}:s1:e2`] = { media: item, positionMs: 20000, durationMs: 100000, updatedAt: 4 - number, episode: { seasonNumber: 1, episodeNumber: 2 } }
    }
    localStorage.setItem('nocta.library.v2', JSON.stringify({ version: 2, favorites: [], progress }))
  })
  await page.goto('/')
  const resume = page.getByRole('region', { name: 'Continue assistindo' })
  await expect(resume).toBeVisible()
  await expect(page.locator('.home-content > section').first()).toHaveAttribute('aria-label', 'Continue assistindo')
  const track = resume.locator('.continue-grid')
  expect(await track.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
  await track.evaluate(el => { el.scrollLeft = el.scrollWidth })
  expect(await track.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false)
  await track.evaluate(el => { el.scrollLeft = 0 })
  await expect(resume.getByRole('link', { name: /^Continuar Série/ })).toHaveAttribute('href', '/assistir/tmdb-tv-91002?temporada=1&episodio=2')
  await page.screenshot({ path: `test-results/continue-${info.project.name}.png`, fullPage: true })
  await resume.getByRole('link', { name: /^Continuar Série/ }).click()
  await expect(page).toHaveURL(/\/assistir\/tmdb-tv-91002\?temporada=1&episodio=2$/)
  await expect(page.locator('iframe')).toHaveCount(1)
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation')
})

test('progressive genre rails, long titles, touch scroll, type selection and offline cache', async ({ page }, info) => {
  let requests = 0
  await page.route('https://api.themoviedb.org/**', async route => {
    requests++
    const url = new URL(route.request().url())
    const tv = url.pathname.includes('/tv')
    const offset = (url.searchParams.get('with_genres') ?? url.pathname).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
    await new Promise(resolve => setTimeout(resolve, 100))
    await route.fulfill({ json: { results: Array.from({ length: 20 }, (_, index) => ({ ...(tv ? series : movie), id: offset * 100 + index, title: `Uma história com um título muito longo para conferir no celular ${index}`, name: `Série com título extenso para conferir ${index}` })) } })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Em alta hoje.', exact: true })).toBeVisible()
  expect(requests).toBeLessThanOrEqual(5)
  for (let index = 0; index < 8 && !await page.getByRole('heading', { name: 'Novelas.', exact: true }).count(); index++) {
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
    await page.waitForTimeout(600)
  }
  await expect(page.getByRole('heading', { name: 'Novelas.', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.screenshot({ path: `test-results/rails-${info.project.name}.png`, fullPage: true })
  await page.goto('/filmes')
  await expect(page.getByRole('heading', { name: 'Filmes em alta hoje.', exact: true })).toBeVisible()
  expect(await page.locator('.poster-link').evaluateAll(links => links.every(link => (link as HTMLAnchorElement).pathname.startsWith('/assistir/tmdb-movie-')))).toBe(true)
  await page.getByRole('link', { name: 'Séries', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Séries em alta hoje.', exact: true })).toBeVisible()
  expect(await page.locator('.poster-link').evaluateAll(links => links.every(link => (link as HTMLAnchorElement).pathname.startsWith('/assistir/tmdb-tv-')))).toBe(true)
  // No reload: moderate cache is intentionally memory-only. Cached movie rails survive a temporary outage.
  await page.unroute('https://api.themoviedb.org/**')
  await page.route('https://api.themoviedb.org/**', route => route.abort())
  await page.getByRole('link', { name: 'Filmes', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Filmes em alta hoje.', exact: true })).toBeVisible()
  expect(await page.locator('.poster-link').count()).toBeGreaterThan(0)
})
