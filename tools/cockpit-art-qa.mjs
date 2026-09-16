import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const base = process.argv[2] || 'http://127.0.0.1:5173/';
const shots = path.resolve('tools/shots');
await fs.mkdir(shots, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', message => { if (['error', 'warn'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`); });
page.on('pageerror', error => errors.push(error.stack));

async function load(url) {
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__miner?.running', { timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 1200));
}

try {
  await load(base);
  await page.screenshot({ path: path.join(shots, 'cockpit-native-normal.png') });

  const demoUrl = new URL(base);
  demoUrl.searchParams.set('scenario', 'dashboard-demo');
  await load(demoUrl.href);
  await page.screenshot({ path: path.join(shots, 'cockpit-native-demo.png') });

  await page.evaluate(() => window.__miner.setViewMode('map'));
  await new Promise(resolve => setTimeout(resolve, 1200));
  await page.screenshot({ path: path.join(shots, 'cockpit-mission-map.png') });

  await page.evaluate(() => window.__miner.setViewMode('upgrade'));
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.screenshot({ path: path.join(shots, 'cockpit-upgrades.png') });
  await page.evaluate(() => window.__miner.setViewMode('external'));

  await page.evaluate(() => window.__miner.twin.dispatch('alert.raise', {
    level: 'CRITICAL', source: 'PUMP', message: '吸矿泵负载达到临界阈值。', key: 'art-qa-critical',
  }));
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.screenshot({ path: path.join(shots, 'cockpit-native-alert.png') });

  await page.evaluate(() => window.__miner.emergencyStop());
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.screenshot({ path: path.join(shots, 'cockpit-native-emergency.png') });

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log(JSON.stringify({ screenshots: ['normal', 'demo', 'mission-map', 'upgrades', 'alert', 'emergency'], errors }, null, 2));
} finally {
  await browser.close();
}

