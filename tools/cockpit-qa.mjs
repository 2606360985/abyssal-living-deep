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
  const progression = await page.evaluate(() => {
    const a = window.__miner, s = a.twin.getSnapshot(); s.mission.extracted = s.mission.plannedYield - .01;
    a.twin.dispatch('simulation.tick', { dt: 1, rate: 100, pumpLoad: 78, totalPower: 1100, turbidity: 55, plume: 30 });
    const reward = a.twin.getSnapshot().economy.credits; a.twin.dispatch('upgrade.purchase', { id: 'collector' });
    const after = a.twin.getSnapshot(); return { completed: after.mission.completed, reward, credits: after.economy.credits, collector: after.upgrades.collector.level, objective: after.mission.objective };
  });
  assert.equal(progression.completed, true); assert.equal(progression.reward, 800); assert.equal(progression.collector, 1); assert.equal(progression.credits, 450); assert.match(progression.objective, /装备升级/);
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
  const layouts = [];
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 2560, height: 1080 }, { width: 900, height: 1200 }]) {
    await page.setViewport(viewport); await new Promise(resolve => setTimeout(resolve, 250));
    const layout = await page.evaluate(() => {
      const root = document.querySelector('#twin-cockpit'), rootRect = root.getBoundingClientRect();
      const view = document.querySelector('#twin-viewport').getBoundingClientRect();
      const panels = [...document.querySelectorAll('.hud-panel,.viewport-panel')].map(node => {
        const rect = node.getBoundingClientRect();
        const childrenFit = [...node.children].filter(child => !child.hidden && getComputedStyle(child).display !== 'none').every(child => {
          const childRect = child.getBoundingClientRect();
          return childRect.left >= rect.left - .01 && childRect.top >= rect.top - .01 && childRect.right <= rect.right + .01 && childRect.bottom <= rect.bottom + .01;
        });
        return { name: node.className, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, childrenFit };
      });
      return { root: { left: rootRect.left, top: rootRect.top, right: rootRect.right, bottom: rootRect.bottom, width: rootRect.width, height: rootRect.height }, viewportWidth: view.width, viewportHeight: view.height, panels };
    });
    assert.ok(Math.abs(layout.root.width / layout.root.height - 16 / 9) < 0.001);
    assert.ok(layout.root.left >= -0.01 && layout.root.top >= -0.01 && layout.root.right <= viewport.width + 0.01 && layout.root.bottom <= viewport.height + 0.01);
    for (const panel of layout.panels) {
      assert.ok(panel.left >= layout.root.left - 0.01 && panel.top >= layout.root.top - 0.01, `${panel.name} starts outside the cockpit`);
      assert.ok(panel.right <= layout.root.right + 0.01 && panel.bottom <= layout.root.bottom + 0.01, `${panel.name} ends outside the cockpit`);
      assert.ok(panel.childrenFit, `${panel.name} clips visible direct content`);
    }
    assert.ok(layout.viewportWidth > 0 && layout.viewportHeight > 0);
    layouts.push({ viewport, root: layout.root, viewportWidth: layout.viewportWidth, viewportHeight: layout.viewportHeight });
  }
  assert.deepEqual(logs, []);
  console.log(JSON.stringify({ initial, mining, progression, layouts, logs }, null, 2));
} finally { await browser.close(); }
