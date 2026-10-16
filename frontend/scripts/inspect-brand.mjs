import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('../.impeccable/review/brand', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
await page.goto('https://www.ic-group.kz/', { waitUntil: 'networkidle', timeout: 60000 });
await page.screenshot({ path: '../.impeccable/review/brand/ic-group-desktop.png', fullPage: false });
const evidence = await page.evaluate(() => ({
  title: document.title,
  text: document.body.innerText.slice(0, 12000),
  assets: [...document.querySelectorAll('img')].map(e => ({ src: e.src, alt: e.alt })),
  sheets: [...document.styleSheets].map(s => s.href),
  styles: [...document.querySelectorAll('h1,h2,header,a,button,p')].slice(0, 65).map(e => {
    const c = getComputedStyle(e);
    return { tag: e.tagName, text: e.textContent.slice(0, 90), font: c.fontFamily, weight: c.fontWeight, size: c.fontSize, color: c.color, background: c.backgroundColor, radius: c.borderRadius };
  })
}));
await writeFile('../.impeccable/review/brand/source.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
await browser.close();
