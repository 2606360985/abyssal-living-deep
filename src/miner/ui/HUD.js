import { CONFIG } from '../config.js';
import './miner.css';

export class HUD {
  constructor() {
    this.root = document.createElement('div'); this.root.id = 'miner-hud'; this.perfEnabled = false;
    this.root.innerHTML = `
      <header><div class="mission"><span class="live-dot"></span> ABYSSAL OPERATIONS <span class="slash">/</span> A—07</div><div class="link">OPTICAL LINK <b>●</b> STABLE</div></header>
      <div class="heading"><span>270</span><span>315</span><strong id="miner-heading">000°</strong><span>045</span><span>090</span><i></i></div>
      <aside class="depth"><small>DEPTH / M</small><strong id="miner-depth">3800.0</strong><div class="depth-rule"></div><small>ALTITUDE / M</small><span id="miner-altitude">4.0</span></aside>
      <div class="reticle"><i></i><i></i><i></i><i></i></div>
      <footer><div class="vehicle-status"><span>ROV A—07</span><strong id="miner-status">STATION KEEPING</strong><small>THRUST <b id="miner-thrust">00</b> % <i></i> LAMPS <b>ON</b></small></div><div class="controls">W S TRANSLATE &nbsp; A D YAW &nbsp; Q E VERTICAL<br><span>F1 HUD &nbsp; F2 PERF &nbsp; F3 FREE CAM &nbsp; F4 CINEMATIC &nbsp; 2 RESET</span></div><div class="mission-code">M1 / VISUAL SURVEY<br><span>ABYSS<span class="slash">//</span>MINER</span></div></footer>
      <pre id="miner-perf" hidden></pre>`;
    document.body.appendChild(this.root);
    this.fields = Object.fromEntries(['heading','depth','altitude','status','thrust','perf'].map(id => [id, this.root.querySelector(`#miner-${id}`)]));
    this.tick = 0;
  }
  toggle() { this.root.hidden = !this.root.hidden; }
  togglePerf() { this.perfEnabled = !this.perfEnabled; this.fields.perf.hidden = !this.perfEnabled; }
  update(app, dt) {
    this.tick += dt; if (this.tick < 0.1) return; this.tick = 0;
    const p = app.rov.root.position, speed = app.motion.velocity.length();
    this.fields.depth.textContent = (CONFIG.depth + app.startY - p.y).toFixed(1);
    this.fields.altitude.textContent = (p.y - app.seabed.heightAt(p.x, p.z)).toFixed(1);
    const heading = ((app.motion.yaw * 180 / Math.PI) % 360 + 360) % 360;
    this.fields.heading.textContent = `${Math.round(heading).toString().padStart(3, '0')}°`;
    const ticks = this.root.querySelectorAll('.heading > span');
    [-90,-45,45,90].forEach((v, i) => { ticks[i].textContent = Math.round((heading + v + 360) % 360).toString().padStart(3, '0'); });
    this.fields.thrust.textContent = Math.min(100, Math.round(speed / CONFIG.speed * 100)).toString().padStart(2, '0');
    this.fields.status.textContent = app.rig.mode === 'free' ? 'FREE CAMERA' : app.rig.mode === 'cinematic' ? 'CINEMATIC CAMERA' : speed > 0.08 ? 'MANUAL TRANSLATION' : 'STATION KEEPING';
    if (this.perfEnabled) {
      const s = app.stats;
      this.fields.perf.textContent = `${app.caps.renderer}\nWEBGL2 / ${app.width} × ${app.height} / DPR ${app.dpr}\n${s.median.toFixed(1)} ms median · ${s.p95.toFixed(1)} ms p95\n${s.calls} draws · ${s.triangles.toLocaleString()} triangles\nSCATTER 50% · SHADOW 1024 · ${CONFIG.particles} particles`;
    }
  }
}
