import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { milestoneChecks } from './miner-milestones.mjs';

const args = process.argv.slice(2);
const arg = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const tag = arg('--tag', 'm1');
const seconds = Number(arg('--seconds', '0'));
const legacy = args.includes('--legacy');
const base = arg('--url', 'http://localhost:5173/');
const out = path.resolve('tools/shots'); await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, executablePath:args.includes('--edge')?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'], defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 } });
const page = await browser.newPage(); const logs = [], checks = [];
page.on('console', msg => { if (['error', 'warn'].includes(msg.type())) logs.push({ type: msg.type(), text: msg.text() }); });
page.on('pageerror', error => logs.push({ type: 'error', text: error.stack }));
page.on('requestfailed', req => logs.push({ type: 'requestfailed', text: req.url() }));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const shot = name => page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
try {
  await page.goto(`${base}${legacy ? '?experience=legacy&site=deep&still=1&preset=high&adaptive=0' : ''}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(legacy ? 'window.__app?.running' : 'window.__miner?.running', { timeout: 60000 });
  await wait(4000);
  if (legacy) {
    await shot('legacy');
    console.log(JSON.stringify(await page.evaluate(() => ({ caps: window.__app.caps, width: window.__app.renderWidth, height: window.__app.renderHeight })), null, 2));
  } else {
    await page.keyboard.press('Digit2');
    if(args.includes('--milestone'))await milestoneChecks(page,Number(arg('--milestone','2')),shot,checks);
    await shot('hud');
    await page.keyboard.press('F1'); await wait(200); await shot('hero');
    for (const pose of ['close', 'low']) {
      await page.evaluate(name => window.__miner.setPose(name), pose); await wait(700); await shot(pose);
    }
    await page.evaluate(() => window.__miner.setPose('hero')); await wait(400);
    if (args.includes('--checks')) {
      const state = () => page.evaluate(() => {
        const a = window.__miner;
        return { pos: a.rov.root.position.toArray(), camera: a.camera.position.toArray(), mode: a.rig.mode, keys: a.keys.size, width: a.width, height: a.height,
          hud: a.hud.hidden ?? a.hud.root.hidden, perf: a.hud.perfEnabled, clearance: a.rov.root.position.y - a.seabed.heightAt(a.rov.root.position.x, a.rov.root.position.z) };
      });
      assert.equal((await state()).hud, true); checks.push('F1 hides all HUD');
      await page.keyboard.press('F1'); await page.keyboard.press('F2'); assert.equal((await state()).perf, true); checks.push('F2 performance display');
      await page.keyboard.press('F3'); assert.equal((await state()).mode, 'free');
      const before = await state(); await page.keyboard.down('KeyW'); await wait(450); await page.keyboard.up('KeyW');
      const after = await state(); assert.deepEqual(after.pos, before.pos); assert.notDeepEqual(after.camera, before.camera); checks.push('Free camera moves without translating vehicle');
      await page.keyboard.press('F3'); assert.equal((await state()).mode, 'follow'); checks.push('F3 returns to follow');
      await page.keyboard.press('F4'); assert.equal((await state()).mode, 'cinematic');
      await page.keyboard.press('F4'); assert.equal((await state()).mode, 'follow'); checks.push('F4 cinematic toggle');
      await page.keyboard.down('KeyW'); await wait(800); await page.keyboard.up('KeyW');
      assert.ok((await state()).pos[2] > before.pos[2]); checks.push('Vehicle forward motion');
      await page.keyboard.down('KeyA'); await wait(250); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.equal((await state()).keys, 0); await page.keyboard.up('KeyA'); checks.push('Blur releases inputs');
      await page.evaluate(() => { const a = window.__miner; a.rov.root.position.y = -100; }); await wait(100);
      assert.ok((await state()).clearance >= 1.19); checks.push('Seabed clearance');
      await page.keyboard.press('Digit2'); const reset = await state();
      assert.ok(Math.abs(reset.pos[0]) < 0.001 && Math.abs(reset.pos[2]) < 0.001); assert.equal(reset.mode, 'follow'); checks.push('Stage 2 resets vehicle and camera');
      await page.setViewport({ width: 960, height: 720 }); await wait(400); assert.ok((await state()).width > 0 && (await state()).width <= 960); checks.push('Viewport resize'); await shot('resize');
      await page.setViewport({ width: 1920, height: 1080 }); await wait(500); await page.keyboard.press('F2');
    }
    if(!args.includes('--keep-hud'))await page.evaluate(() => { window.__miner.setPose('hero'); if(window.__miner.hud.hidden===undefined)window.__miner.hud.root.hidden=true;else if(!window.__miner.hud.hidden)window.__miner.hud.toggle(); });
    else await page.evaluate(()=>window.__miner.setPose('hero'));
    if (seconds > 0) {
      if(args.includes('--stage'))await page.keyboard.press(`Digit${arg('--stage','2')}`);
      console.log(`Sampling native 1920x1080 for ${seconds}s after warmup...`);
      await wait(3000);
      await page.evaluate(() => {
        window.__bench = { frames: [], active: true, last: null };
        const tick = t => { const b = window.__bench; if (!b.active) return; if (b.last !== null) b.frames.push(t - b.last); b.last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      });
      if(Number(arg('--milestone','0'))>=3)await page.evaluate(()=>{window.__pingBench=setInterval(()=>window.__miner.ping(),4200);window.__miner.ping();});
      if(arg('--stage','2')==='5')await page.evaluate(()=>{clearInterval(window.__pingBench);const sample=()=>{const a=window.__miner;a.director.goto(5);a.startSampling(a.state.selected);};window.__pingBench=setInterval(sample,8000);sample();});
      // A short, continuous driving segment is included in the measured run.
      await page.keyboard.down('KeyW'); await wait(Math.min(5000, seconds * 1000)); await page.keyboard.up('KeyW');
      if (seconds > 5) await wait((seconds - 5) * 1000);
      await page.evaluate(() => window.__bench.active = false);
      await page.evaluate(()=>clearInterval(window.__pingBench));
    }
    if (args.includes('--travel')) {
      await page.keyboard.down('KeyW'); await wait(3500); await page.keyboard.up('KeyW'); await shot('travel');
      await page.keyboard.down('KeyA'); await wait(1200); await page.keyboard.up('KeyA'); await wait(700); await shot('turn');
      const y = await page.evaluate(() => window.__miner.rov.root.position.y);
      await page.keyboard.down('KeyE'); await wait(900); await page.keyboard.up('KeyE');
      assert.ok((await page.evaluate(() => window.__miner.rov.root.position.y)) > y); checks.push('Vertical ascent');
      await page.keyboard.press('Digit2');
    }
    const result = await page.evaluate(() => {
      const a = window.__miner, frames = window.__bench?.frames || [];
      let run=0,longest=0;for(const ms of frames){run=ms>33?run+1:0;longest=Math.max(longest,run);}frames.sort((a,b)=>a-b);
      return { caps: a.caps, width: a.width, height: a.height, dpr: a.dpr, stats: a.stats, frames: frames.length, consecutiveOver33:longest,
        median: frames[Math.floor(frames.length * .5)], p95: frames[Math.floor(frames.length * .95)],
        min: frames[0], max: frames.at(-1), resources: performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/OceanFFT|weather\/|MarineLife/.test(n)) };
    });
    result.logs = logs; result.checks = checks;
    await fs.writeFile(path.join(out, `${tag}-report.json`), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
    assert.equal(logs.filter(l=>l.type==='error').length, 0, 'Browser errors');
    assert.equal(result.resources.length, 0, 'Legacy runtime should not load');
  }
  await fs.writeFile(path.join(out, `${tag}-logs.json`), JSON.stringify(logs, null, 2));
  assert.equal(logs.filter(l=>l.type==='error').length, 0, 'Browser errors');
} finally { await browser.close(); }
