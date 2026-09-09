import { CONFIG } from '../config.js';
import { Minimap } from './Minimap.js';
import './miner.css';

export class HUD {
  constructor() {
    this.root = document.createElement('div'); this.root.id = 'miner-hud'; this.perfEnabled = false;
    this.root.innerHTML = `
      <header><div class="mission"><span class="live-dot"></span> 深渊行动 <span class="slash">/</span> A—07</div><div class="link">光纤链路 <b>●</b> 稳定</div></header>
      <div class="heading"><span>270</span><span>315</span><strong id="miner-heading">000°</strong><span>045</span><span>090</span><i></i></div>
      <aside class="depth"><small>深度 / 米</small><strong id="miner-depth">3800.0</strong><div class="depth-rule"></div><small>离底高度 / 米</small><span id="miner-altitude">4.0</span></aside>
      <div class="reticle"><i></i><i></i><i></i><i></i></div>
      <footer><div class="vehicle-status"><span>ROV A—07</span><strong id="miner-status">定点悬停</strong><small>推力 <b id="miner-thrust">00</b> % <i></i> 灯光 <b>开</b></small></div><div class="controls">W S 平移 &nbsp; A D 偏航 &nbsp; Q E 升降<br><span>F1 界面 &nbsp; F2 性能 &nbsp; F3 自由相机 &nbsp; F4 电影 &nbsp; 2 重置</span></div><div class="mission-code">勘察 / 回收<br><span>ABYSS<span class="slash">//</span>MINER</span></div></footer>
      <div class="instrument-message" id="miner-message"></div>
      <section class="echo" id="miner-contact" hidden></section>
      <section class="analysis" id="miner-analysis" hidden></section>
      <div class="candidate" id="miner-candidate" hidden>候选样本</div>
      <div class="end-card" id="miner-ending" hidden></div>
      <pre id="miner-perf" hidden></pre>`;
    document.body.appendChild(this.root);
    this.minimap = new Minimap();
    this.fields = Object.fromEntries(['heading','depth','altitude','status','thrust','perf','message','contact','analysis','candidate','ending'].map(id => [id, this.root.querySelector(`#miner-${id}`)]));
    this.root.querySelector('.controls').innerHTML='W S 平移 · A D 偏航 · Q E 升降 · Z X 侧移<br>空格 声纳 · 左键 确认/采样 · M 音频<br><span>F1 界面 · F2 性能 · F3 自由 · F4 电影 · 1–7 阶段</span>';
    this.root.querySelector('.mission-code').innerHTML='勘察 / 回收<br><span>ABYSS//MINER</span>';
    this.tick = 0;
  }
  toggle() { this.root.hidden = !this.root.hidden; this.minimap.toggle(this.root.hidden); }
  clearMessages() { this.fields.message.textContent='';for(const id of ['contact','analysis','candidate','ending'])this.fields[id].hidden=true;this.setInterference(0); }
  setTelemetry(data) { for(const [key,value] of Object.entries(data))if(this.fields[key])this.fields[key].textContent=value; }
  showMessage(text) { this.fields.message.textContent=text; }
  showContact(data) {
    this.fields.contact.hidden=!data;if(!data)return;
    const e=this.fields.contact;e.replaceChildren();
    const title=document.createElement('strong');title.textContent=data.classification;e.append(title);
    for(const [label,value] of [['方位',`${data.bearing.toFixed(0).padStart(3,'0')}° 相对`],['距离',`${data.distance.toFixed(0)} m`],['预估尺寸',data.size],['置信度',data.confidence],['回波',`#${data.serial} · 快照`]]){
      const row=document.createElement('div'),v=document.createElement('b');row.textContent=label;v.textContent=value;row.append(v);e.append(row);
    }
  }
  showAnalysis(data,acquired=false) {
    const e=this.fields.analysis;e.hidden=!data;if(!data)return;e.replaceChildren();
    const title=document.createElement('strong');title.textContent=acquired?'样本已获取':'多金属结核';e.append(title);
    for(const [label,value] of [['质量',`${data.mass.toFixed(2)} kg`],...Object.entries(data.composition).map(([k,v])=>[k,`${v.toFixed(1)} %`]),["预估价值",`$ ${data.value.toLocaleString('en-US')}`]]){
      const row=document.createElement('div'),v=document.createElement('b');row.textContent=label;v.textContent=value;row.append(v);e.append(row);
    }
  }
  showCandidate(screen,label='候选样本') { const e=this.fields.candidate;e.hidden=!screen;if(screen){e.style.left=`${screen.x*100}%`;e.style.top=`${screen.y*100}%`;e.textContent=label;} }
  setInterference(amount) {this.root.style.setProperty('--interference',amount);this.root.classList.toggle('interfering',amount>.4);}
  showEnding(title) { this.fields.ending.hidden=!title;this.fields.ending.textContent=title||''; }
  togglePerf() { this.perfEnabled = !this.perfEnabled; this.fields.perf.hidden = !this.perfEnabled; }
  update(app, dt) {
    this.tick += dt; if (this.tick < 0.1) return; this.tick = 0;
    this.minimap.update(app);
    const p = app.rov.root.position, speed = app.motion.velocity.length();
    this.fields.depth.textContent = (CONFIG.depth + app.startY - p.y).toFixed(1);
    this.fields.altitude.textContent = (p.y - app.seabed.heightAt(p.x, p.z)).toFixed(1);
    const heading = ((app.motion.yaw * 180 / Math.PI) % 360 + 360) % 360;
    this.fields.heading.textContent = `${Math.round(heading).toString().padStart(3, '0')}°`;
    const ticks = this.root.querySelectorAll('.heading > span');
    [-90,-45,45,90].forEach((v, i) => { ticks[i].textContent = Math.round((heading + v + 360) % 360).toString().padStart(3, '0'); });
    this.fields.thrust.textContent = Math.min(100, Math.round(speed / CONFIG.speed * 100)).toString().padStart(2, '0');
    this.fields.status.textContent = app.rig.mode === 'free' ? '自由相机' : app.rig.mode === 'cinematic' ? '电影相机' : speed > 0.08 ? '手动平移' : '定点悬停';
    if (this.perfEnabled) {
      const s = app.stats;
      this.fields.perf.textContent = `${app.caps.renderer}\nWEBGL2 / ${app.width} × ${app.height} / DPR ${app.dpr}\n${s.median.toFixed(1)} ms 中位 · ${s.p95.toFixed(1)} ms p95\n${s.calls} 绘制 · ${s.triangles.toLocaleString()} 三角形\n${app.quality.name.toUpperCase()} · 泥沙 ${app.sediment.alive} · 音频 ${app.audio.nodeCount}\n阶段 ${app.director.id} · ${app.audio.muted?'已静音':'音频开'}`;
    }
  }
}
