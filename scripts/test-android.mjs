// Uses only our debuggable app on an explicitly selected emulator. No APK references are run.
import { expect } from '@playwright/test'
import { _android } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const serial = process.env.ANDROID_SERIAL
if (!serial?.startsWith('emulator-')) throw new Error('Defina ANDROID_SERIAL para o emulador isolado de teste.')
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
const adbPath = path.join(sdk, 'platform-tools', 'adb.exe')
const pkg = 'app.nocta.prototype'
const output = path.resolve('android-test-results')
const filter = process.env.ANDROID_TEST_FILTER || ''
const resultFile = filter ? 'focused-results.json' : 'results.json'
mkdirSync(output, { recursive: true })
const results = { date: new Date().toISOString(), serial, tests: [], environment: {} }
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8', timeout: 30000, windowsHide: true }).trim()
const screenshot = name => writeFileSync(path.join(output, `${name}.png`), execFileSync(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 30000, windowsHide: true }))
let browser, page
let originalRotation, originalAutoRotation
async function connect() {
  const devices = await _android.devices({ omitDriverInstall: true })
  const device = devices.find(candidate => candidate.serial() === serial)
  if (!device) throw new Error('Emulador selecionado não encontrado no ADB.')
  browser = { close: () => device.close() }
  const webview = await device.webView({ pkg }, { timeout: 30000 })
  page = await webview.page()
  if (!page.url().startsWith('https://localhost')) throw new Error('Origem inesperada no protótipo.')
  page.setDefaultTimeout(30000)
}
async function test(name, work) {
  if (filter && !name.includes(filter)) return
  try {
    const evidence = await work()
    results.tests.push({ name, passed: true, evidence })
    console.log(`PASS ${name}`, JSON.stringify(evidence ?? {}))
  } catch (error) {
    results.tests.push({ name, passed: false, error: error.message })
    console.log(`FAIL ${name}: ${error.message}`)
  }
  writeFileSync(path.join(output, resultFile), JSON.stringify(results, null, 2))
}
async function goto(route) { await page.goto(`https://localhost${route}`, { waitUntil: 'domcontentloaded' }) }
const progress = () => page.evaluate(() => JSON.parse(localStorage.getItem('nocta.library.v1') || '{}').progress?.['demo-bunny']?.positionMs ?? 0)
try {
  originalRotation = adb('shell', 'settings', 'get', 'system', 'user_rotation')
  originalAutoRotation = adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation')
  results.environment.android = adb('shell', 'getprop', 'ro.build.version.release')
  results.environment.sdk = adb('shell', 'getprop', 'ro.build.version.sdk')
  results.environment.webview = adb('shell', 'dumpsys', 'webviewupdate')
  adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`)
  await connect()
  await test('App local, identidade e barras seguras em retrato', async () => {
    await goto('/')
    await expect(page.locator('h1')).toHaveText('Além do Horizonte')
    const metrics = await page.evaluate(() => ({ origin: location.origin, userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio, overflow: document.documentElement.scrollWidth > innerWidth + 1, coarse: matchMedia('(pointer: coarse)').matches, existingFavorites: JSON.parse(localStorage.getItem('nocta.library.v1') || '{}').favorites?.length ?? 0, nav: document.querySelector('.mobile-nav').getBoundingClientRect().toJSON() }))
    expect(metrics.origin).toBe('https://localhost')
    expect(metrics.overflow).toBe(false)
    expect(metrics.nav.bottom).toBeLessThanOrEqual(metrics.height + 1)
    screenshot('home-portrait')
    return metrics
  })
  await test('Favorito persistido e Voltar nativo entre rotas', async () => {
    const button = page.getByRole('button', { name: 'Minha lista', exact: true })
    if (await button.count()) await button.click()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nocta.library.v1')).favorites.length)).toBeGreaterThan(0)
    await page.locator('.mobile-nav a[href="/series"]').click()
    await expect(page).toHaveURL(/\/series$/)
    adb('shell', 'input', 'keyevent', '4')
    await expect(page).toHaveURL('https://localhost/')
  })
  await test('Gestos de rolagem vertical e horizontal no WebView', async () => {
    await goto('/')
    await expect(page.locator('h1')).toHaveText('Além do Horizonte')
    const physical = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/)
    const physicalWidth = Number(physical[1]), physicalHeight = Number(physical[2])
    adb('shell', 'input', 'swipe', String(Math.round(physicalWidth / 2)), String(Math.round(physicalHeight * .7)), String(Math.round(physicalWidth / 2)), String(Math.round(physicalHeight * .27)), '550')
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 20000 }).toBeGreaterThan(50)
    const carousel = page.locator('.carousel').first()
    await carousel.scrollIntoViewIfNeeded()
    const rect = await carousel.boundingBox()
    const y = rect.y + Math.min(rect.height / 2, 100)
    const before = await carousel.evaluate(el => el.scrollLeft)
    // Trusted touch events use the real WebView viewport, without guessing native cutout offsets.
    const session = await page.context().newCDPSession(page)
    const point = x => [{ x, y, id: 1 }]
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(rect.x + rect.width * .85) })
    for (let step = 1; step <= 12; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(rect.x + rect.width * (.85 - .65 * step / 12)) })
      await new Promise(resolve => setTimeout(resolve, 30))
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await session.detach()
    await expect.poll(() => carousel.evaluate(el => el.scrollLeft), { timeout: 20000 }).toBeGreaterThan(before + 20)
    screenshot('carousel-touch')
    return { before, after: await carousel.evaluate(el => el.scrollLeft) }
  })
  await test('Busca, detalhes e temporadas preservados', async () => {
    await goto('/buscar')
    await page.getByRole('textbox', { name: 'Buscar filmes e séries' }).fill('orbita')
    await expect(page.locator('.card-title')).toHaveText(['Órbita'])
    adb('shell', 'input', 'keyevent', '4') // closes the Android keyboard first
    await goto('/titulo/fiction-3')
    await expect(page.locator('.episode')).toHaveCount(6)
    await page.getByLabel('Selecionar temporada').selectOption('2')
    await expect(page.locator('.episode')).toHaveCount(4)
    screenshot('series')
  })
  await test('Título sem autorização não cria player', async () => {
    await goto('/assistir/tmdb-movie-123')
    await expect(page.getByRole('heading', { name: 'Reprodução não disponível' })).toBeVisible()
    expect(await page.locator('video').count()).toBe(0)
  })
  await test('Big Buck Bunny: reprodução real, progresso e pausa em segundo plano', async () => {
    await goto('/assistir/demo-bunny')
    const video = page.locator('video')
    await expect(video).toBeVisible()
    // A trusted click preserves the ordinary WebView user-gesture policy.
    await video.click()
    await expect.poll(() => video.evaluate(v => ({ paused: v.paused, time: v.currentTime })), { timeout: 60000 }).toMatchObject({ paused: false })
    const first = await video.evaluate(v => v.currentTime)
    await expect.poll(() => video.evaluate(v => v.currentTime), { timeout: 60000 }).toBeGreaterThan(first + 1)
    await video.evaluate(v => { v.currentTime = 42 })
    await expect.poll(progress, { timeout: 20000 }).toBeGreaterThan(40000)
    screenshot('licensed-video')
    adb('shell', 'input', 'keyevent', '3')
    await expect.poll(() => video.evaluate(v => v.paused)).toBe(true)
    const saved = await progress()
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`)
    await expect.poll(() => video.evaluate(v => v.paused)).toBe(true)
    return { first, saved, pausedOnReturn: true }
  })
  await test('Tela cheia e Voltar encerram apenas a tela cheia', async () => {
    await page.getByRole('button', { name: 'Tela cheia', exact: true }).click()
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true)
    screenshot('fullscreen')
    adb('shell', 'input', 'keyevent', '4')
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false)
    await expect(page).toHaveURL(/\/assistir\/demo-bunny$/)
  })
  await test('Favoritos e progresso sobrevivem ao fechamento do processo', async () => {
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('nocta.library.v1')))
    expect(before.favorites.length).toBeGreaterThan(0)
    expect(before.progress['demo-bunny'].positionMs).toBeGreaterThan(40000)
    await browser.close()
    adb('shell', 'am', 'force-stop', pkg)
    adb('shell', 'am', 'start', '-n', `${pkg}/.MainActivity`)
    // Wait only for our app's debug socket, never change a WebView security policy.
    await expect.poll(() => {
      try { return adb('shell', 'cat', '/proc/net/unix').includes(`webview_devtools_remote_${adb('shell', 'pidof', pkg).split(' ')[0]}`) }
      catch { return false }
    }, { timeout: 45000 }).toBe(true)
    await connect()
    await goto('/assistir/demo-bunny')
    await expect.poll(() => page.locator('video').evaluate(v => v.currentTime), { timeout: 45000 }).toBeGreaterThan(40)
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('nocta.library.v1')))
    expect(after.favorites.map(m => m.id)).toEqual(before.favorites.map(m => m.id))
    return { favorites: after.favorites.length, resumedSeconds: await page.locator('video').evaluate(v => v.currentTime) }
  })
  for (const id of ['demo-sintel', 'demo-steel']) await test(`${id}: amostra autorizada avança no WebView`, async () => {
    await goto(`/assistir/${id}`)
    const video = page.locator('video')
    await expect(video).toBeVisible()
    await video.click()
    const start = await video.evaluate(v => v.currentTime)
    await expect.poll(() => video.evaluate(v => v.currentTime), { timeout: 60000 }).toBeGreaterThan(start + 1)
    const seconds = await video.evaluate(v => v.currentTime)
    await video.evaluate(v => v.pause())
    return { seconds }
  })
  await test('Paisagem sem transbordamento e com barras respeitadas', async () => {
    adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '1')
    await expect.poll(() => page.evaluate(() => innerWidth > innerHeight), { timeout: 30000 }).toBe(true)
    const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 }))
    expect(dimensions.overflow).toBe(false)
    screenshot('landscape')
    return dimensions
  })
  await test('Voltar no início minimiza o aplicativo', async () => {
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '0')
    await goto('/')
    await expect(page.locator('h1')).toHaveText('Além do Horizonte')
    adb('shell', 'input', 'keyevent', '4')
    await expect.poll(() => adb('shell', 'dumpsys', 'activity', 'activities').split('\n').filter(line => /topResumedActivity|mResumedActivity/.test(line)).join('\n')).not.toContain(pkg)
  })
} finally {
  if (originalRotation && originalAutoRotation) {
    try {
      adb('shell', 'settings', 'put', 'system', 'user_rotation', originalRotation)
      adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', originalAutoRotation)
    } catch { /* emulator may already be closed */ }
  }
  if (browser) await browser.close().catch(() => {})
  writeFileSync(path.join(output, resultFile), JSON.stringify(results, null, 2))
}
if (results.tests.some(test => !test.passed)) process.exitCode = 1
