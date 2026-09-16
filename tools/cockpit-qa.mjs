import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const base = process.argv[2] || 'http://localhost:5173/';
const browser = await puppeteer.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'], defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 } });
const page = await browser.newPage(), logs = [];
page.on('console', message => { if (['error', 'warn'].includes(message.type())) logs.push(`${message.type()}: ${message.text()}`); });
page.on('pageerror', error => logs.push(error.stack));
try {
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__miner?.running', { timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 1200));
  const initial = await page.evaluate(() => {
    const a = window.__miner, c = a.field.candidates[0];
    a.state.dispatch('poiDiscovered'); a.state.dispatch('fieldScanned');
    a.twin.dispatch('sample.acquired', { sample: c }); a.field.place(5.5); a.switchVehicle('C01');
    return { active: a.twin.getSnapshot().vehicle.activeId, cargo: a.twin.getSnapshot().cargo.current };
  });
  assert.equal(initial.active, 'C01');
  await new Promise(resolve => setTimeout(resolve, 350));
  const eligible = await page.evaluate(() => window.__miner.twin.getSnapshot().mining.eligible); assert.equal(eligible, true);
  await page.keyboard.press('KeyT'); await new Promise(resolve => setTimeout(resolve, 1500));
  const mining = await page.evaluate(() => { const s = window.__miner.twin.getSnapshot(); return { active: s.mining.active, cargo: s.cargo.current, rate: s.mining.rate, power: s.power.total, turbidity: s.environment.turbidity, logs: s.logs.length }; });
  assert.equal(mining.active, true); assert.ok(mining.cargo > initial.cargo); assert.ok(mining.rate > 0); assert.ok(mining.power > 900); assert.ok(mining.turbidity > 8); assert.ok(mining.logs > 1);
  await page.evaluate(() => window.__miner.emergencyStop());
  assert.deepEqual(await page.evaluate(() => { const s = window.__miner.twin.getSnapshot(); return [s.vehicle.emergency, s.mining.active, s.vehicle.controlMode]; }), [true, false, 'hold']);
  await page.evaluate(() => window.__miner.rearm());
  for (const mode of ['map', 'model', 'simulation', 'external']) {
    await page.evaluate(mode => window.__miner.setViewMode(mode), mode);
    assert.equal(await page.evaluate(() => window.__miner.twin.getSnapshot().ui.viewMode), mode);
  }
  for (const mode of ['manual', 'assist', 'auto', 'hold']) {
    if (mode === 'auto') await page.evaluate(() => {
      const p = window.__miner.rov.root.position;
      window.__miner.setWaypoint(p.x + 60, p.z + 60);
    });
    await page.evaluate(mode => window.__miner.setControlMode(mode), mode);
    assert.equal(await page.evaluate(() => window.__miner.twin.getSnapshot().vehicle.controlMode), mode);
  }
  await page.evaluate(() => window.__miner.simulation.persist());
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('abyss-miner.save.v1')).unlockedVehicles.includes('C01')), true);
  await page.setViewport({ width: 1366, height: 768 }); await new Promise(resolve => setTimeout(resolve, 500));
  const layout = await page.evaluate(() => { const root = document.querySelector('#twin-cockpit'), view = document.querySelector('#twin-viewport').getBoundingClientRect(); return { width: root.scrollWidth, height: root.scrollHeight, viewportWidth: view.width, viewportHeight: view.height }; });
  assert.ok(layout.width <= 1366 && layout.height <= 768); assert.ok(layout.viewportWidth > 450 && layout.viewportHeight > 250);
  assert.deepEqual(logs, []);
  console.log(JSON.stringify({ initial, mining, layout, logs }, null, 2));
} finally { await browser.close(); }
