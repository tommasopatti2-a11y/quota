// Genera le icone PNG della PWA da public/favicon.svg con Chromium (Playwright).
// Uso: npm run icons  (richiede Playwright disponibile nell'ambiente)
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let playwright
try {
  playwright = require('playwright')
} catch {
  playwright = require(require.resolve('playwright', { paths: [process.env.NODE_PATH ?? ''] }))
}

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname
const BG = '#14161b'
const targets = [
  { name: 'pwa-192-v2.png', size: 192, scale: 1, square: false },
  { name: 'pwa-512-v2.png', size: 512, scale: 1, square: false },
  { name: 'apple-touch-icon-v2.png', size: 180, scale: 1, square: true },
  // Maskable: sfondo pieno e simbolo dentro la "safe zone".
  { name: 'pwa-maskable-512-v2.png', size: 512, scale: 0.78, square: true },
]

const browser = await playwright.chromium.launch()
const page = await browser.newPage()
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size })
  const inner = Math.round(t.size * t.scale)
  const icon = svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `).replace('rx="112"', t.square ? 'rx="0"' : 'rx="112"')
  const bg = t.square ? BG : 'transparent'
  await page.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;height:100vh">${icon}</body></html>`)
  await page.screenshot({ path: out(t.name), omitBackground: !t.square })
}
await browser.close()
console.log('Icone generate')
