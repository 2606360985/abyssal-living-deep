import { CONFIG } from '../config.js';
import './cockpit.css';
import './frame-skin.css';

const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const statusText = status => ({ online: '在线', warning: '警告', error: '故障', offline: '离线', standby: '待机' }[status] || status);
const hhmmss = seconds => {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

function sparkline(canvas, values, color = '#31d9de', fill = true) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.floor(rect.width * dpr)), height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#1a3d48'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const y = height * i / 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  if (!values.length) { ctx.fillStyle = '#557078'; ctx.font = `${9 * dpr}px monospace`; ctx.fillText('暂无任务数据', 8 * dpr, height / 2); return; }
  const min = Math.min(...values), max = Math.max(...values), range = Math.max(1, max - min);
  const points = values.map((value, index) => [index / Math.max(1, values.length - 1) * width, height - 5 * dpr - (value - min) / range * (height - 12 * dpr)]);
  if (fill) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, `${color}55`); gradient.addColorStop(1, `${color}00`);
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(points[0][0], height); for (const point of points) ctx.lineTo(...point); ctx.lineTo(points.at(-1)[0], height); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = color; ctx.lineWidth = 1.4 * dpr; ctx.beginPath(); points.forEach((point, index) => index ? ctx.lineTo(...point) : ctx.moveTo(...point)); ctx.stroke();
}

export class CockpitHUD {
  constructor(app, canvas, store) {
    this.app = app; this.store = store; this.perfEnabled = false; this.tick = 0; this.mapTick = 0;
    this.root = document.createElement('div'); this.root.id = 'twin-cockpit';
    this.root.innerHTML = `
      <header class="cockpit-header">
        <div class="brand-mark">♆</div><div class="brand"><strong>ABYSSAL OPS <i>v3.5</i></strong><span>深海采矿数字孪生系统</span></div>
        <nav class="workspace-tabs" aria-label="工作模式">
          <button data-workspace="explore" class="active">勘探 <b>EXPLORE</b></button><button data-workspace="extract">开采 <b>EXTRACT</b></button><button data-workspace="sustain">环境 <b>SUSTAIN</b></button>
        </nav>
        <div class="system-brand"><strong>NEPTUNE SYSTEMS</strong><span>SEAFLOOR INTELLIGENCE</span></div>
        <div class="mission-clock"><span id="twin-utc">--</span><b>任务时间 D+ <i id="twin-mission-time">00:00:00</i></b></div>
      </header>
      <main class="cockpit-main">
        <aside class="cockpit-column left-column">
          <section class="hud-panel tools-panel" data-focus="extract"><h2>工具与设备 <small>6 / 8</small></h2>
            <div class="tool-grid">
              <button class="tool active" data-tool="sonar"><i>◉</i><span>主动声呐</span></button><button class="tool" data-tool="camera"><i>▣</i><span>光学相机</span></button>
              <button class="tool" data-tool="arm"><i>⌁</i><span>机械臂</span></button><button class="tool" data-tool="sampler"><i>◆</i><span>取样器</span></button>
              <button class="tool locked" data-tool="collector"><i>⟐</i><span>采集头</span></button><button class="tool locked" data-tool="pump"><i>◎</i><span>吸矿泵</span></button>
              <button class="tool" data-tool="light"><i>✦</i><span>作业灯</span></button><button class="tool locked"><i>＋</i><span>扩展槽</span></button>
            </div>
          </section>
          <section class="hud-panel resources-panel"><h2>矿物资源</h2><div class="resource-grid" id="twin-resources"></div></section>
          <section class="hud-panel cargo-panel" data-focus="extract"><h2>货舱 CARGO <small id="twin-cargo-percent">0%</small></h2>
            <div class="cargo-visual"><div class="cargo-crate">▧</div><div><strong id="twin-cargo">0 / 3,000 t</strong><div class="meter"><i id="twin-cargo-bar"></i></div></div></div>
          </section>
          <section class="hud-panel subsystem-panel"><h2>子系统模块</h2><div id="twin-systems" class="system-list"></div></section>
        </aside>

        <section class="center-stack">
          <div class="viewport-panel">
            <div class="viewport-title"><h1>LIVE DIGITAL TWIN</h1><div class="view-tabs">
              <button data-view="external" class="active">外部视角</button><button data-view="map">海底地图</button><button data-view="model">3D 模型</button><button data-view="simulation">模拟推演</button>
            </div><span class="camera-feed">CAM-01 · LIVE <i></i></span></div>
            <div class="twin-viewport" id="twin-viewport">
              <div class="viewport-shade"></div>
              <div class="telemetry-block"><div>DEPTH <b id="twin-depth">3800.0 m</b></div><div>TEMP <b id="twin-temp">2.1 °C</b></div><div>PRESS <b id="twin-pressure">380 bar</b></div><div>HDG <b id="twin-heading">000.0°</b></div><div>SPD <b id="twin-speed">0.0 m/s</b></div></div>
              <div class="depth-tape"><span>3790</span><span>3800</span><strong id="twin-depth-tape">3800 m</strong><span>3810</span><span>3820</span></div>
              <div class="hud-reticle"><i></i><i></i><i></i><i></i></div>
              <section class="target-card" id="twin-target" hidden></section>
              <div class="cockpit-message" id="twin-message"></div>
              <div class="cockpit-candidate" id="twin-candidate" hidden>候选样本</div>
              <div class="control-hints"><span>[W/S] 前进 / 后退</span><span>[A/D] 偏航</span><span>[Q/E] 升降</span><span>[SPACE] 声呐</span><span>[T] 采集器</span></div>
              <div class="map-card"><canvas id="twin-mini-map"></canvas><span>海床地形 / 资源热区</span></div>
              <div class="view-overlay" data-overlay="map" hidden><div class="overlay-heading">海底作业地图 <span class="map-layers"><button data-map-layer="topo" class="active">TOPO</button><button data-map-layer="resource" class="active">RESOURCE</button><button data-map-layer="waypoints" class="active">WAYPOINTS</button></span></div><canvas id="twin-full-map"></canvas></div>
              <div class="view-overlay model-overlay" data-overlay="model" hidden><div class="model-scan"></div><div class="model-info"><strong id="twin-model-name">A-07 / WORK CLASS ROV</strong><span>拖动旋转 · 滚轮缩放 · 点击子系统定位</span><div id="twin-model-systems"></div><dl id="twin-system-detail"></dl></div></div>
              <div class="view-overlay simulation-overlay" data-overlay="simulation" hidden><div class="overlay-heading">WHAT-IF 模拟推演 <span>不会改变实时任务</span></div>
                <div class="sim-controls"><label>推进速度 <input id="sim-speed" type="range" min="10" max="100" value="55"></label><label>泵功率 <input id="sim-pump" type="range" min="0" max="100" value="78"></label><label>路线难度 <input id="sim-route" type="range" min="1" max="5" value="2"></label></div>
                <div class="sim-results"><div><span>预计产量</span><b id="sim-yield">110 t/h</b></div><div><span>功率需求</span><b id="sim-power">1,280 kW</b></div><div><span>设备磨损</span><b id="sim-wear">0.8 %/h</b></div><div><span>羽流指数</span><b id="sim-plume">42 / 100</b></div></div>
              </div>
              <pre id="twin-perf" hidden></pre>
              <div class="end-card" id="twin-ending" hidden></div>
            </div>
          </div>
        </section>

        <aside class="cockpit-column right-column">
          <section class="hud-panel mission-panel"><h2>操作员与任务</h2><div class="operator-card"><div class="operator-avatar">◢<i>●</i>◣</div><div><small>操作员</small><strong>A. CHEN</strong><em>● 在线</em></div></div><dl><dt>任务</dt><dd id="twin-mission-id">KRONOS-1</dd><dt>目标</dt><dd id="twin-objective">识别结核并完成试采</dd><dt>状态</dt><dd id="twin-mission-status">勘探中</dd></dl></section>
          <section class="hud-panel vehicle-panel"><h2>载具系统状态</h2><div class="vehicle-selector"><button data-vehicle="A07" class="active">A-07<br><small>ROV</small></button><button data-vehicle="C01" class="locked">C-01<br><small>COLLECTOR</small></button></div><div class="vehicle-blueprint">⌁<strong id="twin-vehicle-name">A-07</strong><span id="twin-vehicle-state">● 在线</span></div><div id="twin-health-list" class="health-list"></div></section>
          <section class="hud-panel control-panel"><h2>控制面板</h2><div class="control-modes"><button data-control="manual" class="active">MANUAL</button><button data-control="assist">ASSIST</button><button data-control="auto">AUTO</button><button data-control="hold">HOLD</button></div><div class="dpad"><i>▲</i><span>◀</span><b>◆</b><span>▶</span><i>▼</i></div><div class="quick-actions"><button data-action="ping">◉<small>声呐</small></button><button data-action="tool">⟐<small>工具</small></button><button data-action="reset">↻<small>重置</small></button></div><button class="emergency-button" data-action="emergency">◉ 紧急停止</button></section>
        </aside>
      </main>

      <section class="bottom-deck">
        <div class="metric-row">
          <section class="hud-panel chart-panel"><h2>实时开采速率 <strong id="twin-rate">0 t/h</strong></h2><canvas data-chart="rate"></canvas></section>
          <section class="hud-panel chart-panel"><h2>累计产量 <strong id="twin-lifetime">0 t</strong></h2><canvas data-chart="lifetime"></canvas></section>
          <section class="hud-panel compact-health"><h2>载具健康</h2><div id="twin-health-bars"></div></section>
          <section class="hud-panel chart-panel"><h2>深度与环境 <strong id="twin-environment">2.1°C / 380bar</strong></h2><canvas data-chart="depth"></canvas></section>
          <section class="hud-panel chart-panel"><h2>功率与泵载荷 <strong id="twin-power">420 kW</strong></h2><canvas data-chart="power"></canvas></section>
        </div>
        <div class="intel-row">
          <section class="hud-panel log-panel"><h2>任务日志</h2><div id="twin-logs"></div></section>
          <section class="hud-panel alert-panel"><h2>告警与通知 <small id="twin-alert-count">0</small></h2><div id="twin-alerts"></div></section>
          <section class="hud-panel seafloor-panel"><h2>海床地图</h2><canvas id="twin-bottom-map"></canvas></section>
          <section class="hud-panel overview-panel"><h2>任务总览</h2><dl id="twin-overview"></dl><div class="save-actions"><button data-action="reset-mission">重置任务</button><button data-action="clear-save">清除存档</button></div></section>
        </div>
      </section>
      <div class="confirm-modal" id="twin-emergency-modal" hidden><div><h2>确认紧急停止？</h2><p>推进、机械臂、采集头和吸矿泵将立即冻结。</p><button data-action="confirm-emergency">确认停止</button><button data-action="cancel-emergency">取消</button></div></div>`;
    document.body.appendChild(this.root);
    this.viewport = this.root.querySelector('#twin-viewport'); this.viewport.prepend(canvas);
    this.fields = Object.fromEntries([...this.root.querySelectorAll('[id^="twin-"]')].map(node => [node.id.slice(5), node]));
    this.bind(); this.render(this.store.getSnapshot()); this.updateSimulationPreview();
  }
  bind() {
    this.root.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.workspace) this.store.dispatch('ui.workspace', { mode: button.dataset.workspace });
      if (button.dataset.view) this.app.setViewMode(button.dataset.view);
      if (button.dataset.vehicle) this.app.switchVehicle(button.dataset.vehicle);
      if (button.dataset.control) this.app.setControlMode(button.dataset.control);
      if (button.dataset.mapLayer) this.store.dispatch('ui.mapLayer',{layer:button.dataset.mapLayer});
      if (button.dataset.alert) { const alert=this.store.getSnapshot().alerts.find(item=>item.id===button.dataset.alert);if(alert?.source==='ENV'){this.store.dispatch('ui.workspace',{mode:'sustain'});this.app.setViewMode('map');}else if(alert)this.app.setViewMode('model');this.store.dispatch('alert.acknowledge', { id: button.dataset.alert }); }
      if (button.dataset.system) { this.store.dispatch('ui.system',{id:button.dataset.system}); this.app.setViewMode('model'); this.showMessage(`${button.textContent.trim()} · 已在 3D 模型中定位`); }
      if (button.dataset.tool) this.store.dispatch('tool.select', { tool: button.dataset.tool });
      if (button.dataset.tool === 'sonar') this.app.ping();
      if (['collector', 'pump'].includes(button.dataset.tool)) this.app.toggleMining();
      if (button.dataset.tool === 'camera') this.app.setViewMode('external');
      if (button.dataset.tool === 'arm') this.showMessage('机械臂待命 · 锁定候选样本后左键操作');
      if (button.dataset.tool === 'sampler') this.showMessage('取样器待命 · 请进入 4m 作业距离');
      if (button.dataset.tool === 'light') { const enabled = !this.app.rov.lights[0].visible; for (const light of this.app.rov.lights) light.visible = enabled; this.showMessage(`作业灯已${enabled ? '开启' : '关闭'}`); }
      const action = button.dataset.action;
      if (action === 'ping') this.app.ping();
      if (action === 'tool') this.app.toggleMining();
      if (action === 'reset') this.app.director.goto(2);
      if (action === 'emergency') {
        if (this.store.getSnapshot().vehicle.emergency) this.app.rearm(); else this.fields['emergency-modal'].hidden = false;
      }
      if (action === 'confirm-emergency') { this.fields['emergency-modal'].hidden = true; this.app.emergencyStop(); }
      if (action === 'cancel-emergency') this.fields['emergency-modal'].hidden = true;
      if (action === 'reset-mission') this.app.resetMission();
      if (action === 'clear-save') this.app.clearSave();
    });
    for (const input of this.root.querySelectorAll('.sim-controls input')) input.addEventListener('input', () => this.updateSimulationPreview());
    this.fields['full-map'].addEventListener('pointerdown',event=>{const rect=this.fields['full-map'].getBoundingClientRect(),u=(event.clientX-rect.left)/rect.width,v=(event.clientY-rect.top)/rect.height;this.app.setWaypoint((u-.5)*140,(v-.5)*140+56);});
  }
  getViewportRect() { return this.viewport.getBoundingClientRect(); }
  toggle() { this.hidden = !this.hidden; this.root.classList.toggle('hud-hidden', this.hidden); this.store.dispatch('ui.visibility', { visible: !this.hidden }); }
  togglePerf() { this.perfEnabled = !this.perfEnabled; this.fields.perf.hidden = !this.perfEnabled; this.store.dispatch('ui.performance', { visible: this.perfEnabled }); }
  clearMessages() { this.fields.message.textContent = ''; this.fields.candidate.hidden = true; this.fields.ending.hidden = true; this.setInterference(0); }
  setTelemetry(data) { for (const [key, value] of Object.entries(data)) if (this.fields[key]) this.fields[key].textContent = value; }
  showMessage(text) { this.fields.message.textContent = text; }
  showContact(data) { if (data) this.store.dispatch('runtime.target', { target: { ...data, type: data.classification } }); }
  showAnalysis(data, acquired = false) {
    if (!data) return;
    this.store.dispatch('runtime.target', { target: { id: data.id, type: acquired ? '已获取样本' : '多金属结核', confidence: 92, grade: data.value > 6000 ? '高' : '中', mass: data.mass, composition: data.composition, value: data.value } });
  }
  showCandidate(screen, label = '候选样本') { const node = this.fields.candidate; node.hidden = !screen; if (screen) { node.style.left = `${screen.x * 100}%`; node.style.top = `${screen.y * 100}%`; node.textContent = label; } }
  setInterference(amount) { this.root.style.setProperty('--interference', amount); this.root.classList.toggle('interfering', amount > .4); }
  showEnding(title) { this.fields.ending.hidden = !title; this.fields.ending.textContent = title || ''; }
  updateSimulationPreview() {
    const speed = Number(this.root.querySelector('#sim-speed')?.value || 55), pump = Number(this.root.querySelector('#sim-pump')?.value || 78), route = Number(this.root.querySelector('#sim-route')?.value || 2);
    this.root.querySelector('#sim-yield').textContent = `${Math.round(pump * 1.62 * (1 - route * .035))} t/h`;
    this.root.querySelector('#sim-power').textContent = `${Math.round(420 + speed * 4.8 + pump * 8.1).toLocaleString()} kW`;
    this.root.querySelector('#sim-wear').textContent = `${(pump * .008 + route * .12).toFixed(1)} %/h`;
    this.root.querySelector('#sim-plume').textContent = `${Math.round(pump * .62 + route * 3)} / 100`;
  }
  update(app, dt) {
    this.tick += dt; this.mapTick += dt; if (this.tick < .1) return; this.tick = 0;
    const state = this.store.getSnapshot(); this.render(state);
    if (this.mapTick >= 1) { this.mapTick = 0; this.drawMaps(app, state); }
    if (this.perfEnabled) {
      const s = app.stats; this.fields.perf.textContent = `${app.caps.renderer}\nWEBGL2 · ${app.width}×${app.height} · DPR ${app.dpr}\n${s.median.toFixed(1)}ms MED · ${s.p95.toFixed(1)}ms P95\n${s.calls} DRAW · ${s.triangles.toLocaleString()} TRI\n${app.quality.name.toUpperCase()} · 阶段 ${app.director.id}`;
    }
  }
  render(s) {
    this.root.dataset.workspace = s.ui.workspaceMode;
    this.fields.utc.textContent = s.clock.utc.replace('T', ' ').slice(0, 19) + ' UTC'; this.fields['mission-time'].textContent = hhmmss(s.clock.missionSeconds);
    this.fields.depth.textContent = `${fmt(s.telemetry.depth, 1)} m`; this.fields['depth-tape'].textContent = `${fmt(s.telemetry.depth, 0)} m`;
    this.fields.temp.textContent = `${fmt(s.environment.temperature, 1)} °C`; this.fields.pressure.textContent = `${fmt(s.environment.pressure, 0)} bar`;
    this.fields.heading.textContent = `${fmt(s.telemetry.heading, 1)}°`; this.fields.speed.textContent = `${fmt(s.telemetry.speed, 1)} m/s`;
    this.fields['mission-id'].textContent = s.mission.id; this.fields.objective.textContent = s.mission.objective; this.fields['mission-status'].textContent = s.mission.status;
    this.fields['cargo-percent'].textContent = `${fmt(s.cargo.level, 0)}%`; this.fields.cargo.textContent = `${fmt(s.cargo.current, 1)} / ${fmt(s.cargo.capacity)} t`; this.fields['cargo-bar'].style.width = `${Math.min(100, s.cargo.level)}%`;
    this.fields.rate.textContent = `${fmt(s.mining.rate)} t/h`; this.fields.power.textContent = `${fmt(s.power.total)} kW`; this.fields.environment.textContent = `${fmt(s.environment.temperature, 1)}°C / ${fmt(s.environment.pressure)}bar`;
    const lifetime = Object.values(s.analytics.lifetime).reduce((sum, value) => sum + value, 0) + Object.values(s.resources).reduce((sum, value) => sum + value, 0);
    this.fields.lifetime.textContent = `${fmt(lifetime, 1)} t`;
    this.fields['vehicle-name'].textContent = s.vehicle.profiles[s.vehicle.activeId].name; this.fields['vehicle-state'].textContent = s.vehicle.emergency ? '● 紧急冻结' : '● 在线';
    this.fields['model-name'].textContent = `${s.vehicle.profiles[s.vehicle.activeId].name} / ${s.vehicle.profiles[s.vehicle.activeId].type}`;
    this.fields.resources.innerHTML = Object.entries(s.resources).map(([key, value]) => `<div><span>${key}</span><i class="mineral mineral-${key.toLowerCase()}"></i><strong>${fmt(value, 2)} t</strong></div>`).join('');
    this.fields.systems.innerHTML = Object.entries(s.systems).map(([key, value]) => `<button data-system="${key}" class="status-${value.status}"><i>◉</i><span>${value.label}</span><b>● ${statusText(value.status)}</b></button>`).join('');
    const labels = { hull: '耐压舱体', thrusters: '推进器', manipulators: '机械臂', drill: '采集头', pump: '吸矿泵', power: '电源系统', comms: '通信' };
    this.fields['health-list'].innerHTML = Object.entries(s.health).map(([key, value]) => `<div><span>${labels[key]}</span><i><b style="width:${value}%"></b></i><strong>${fmt(value)}%</strong></div>`).join('');
    this.fields['health-bars'].innerHTML = Object.entries(s.health).slice(0, 6).map(([key, value]) => `<div><span>${labels[key]}</span><i><b style="width:${value}%"></b></i><strong>${fmt(value)}%</strong></div>`).join('');
    this.fields['model-systems'].innerHTML = Object.values(s.systems).map(system => `<span class="status-${system.status}">● ${system.label}</span>`).join('');
    const selectedSystem=s.systems[s.ui.selectedSystem]||s.systems.navigation;
    this.fields['system-detail'].innerHTML=`<dt>当前模块</dt><dd>${selectedSystem.label}</dd><dt>状态</dt><dd>${statusText(selectedSystem.status)}</dd><dt>功率</dt><dd>${fmt(selectedSystem.power)} kW</dd><dt>温度</dt><dd>${fmt(selectedSystem.temperature,1)} °C</dd><dt>振动</dt><dd>${fmt(selectedSystem.vibration,1)} mm/s</dd><dt>故障</dt><dd>${selectedSystem.fault}</dd>`;
    this.fields.logs.innerHTML = s.logs.slice(0, 6).map(item => `<div><time>${item.time}</time><b class="level-${item.level}">[${item.level}]</b><span>${item.message}</span></div>`).join('');
    const activeAlerts = s.alerts.filter(alert => !alert.acknowledged); this.fields['alert-count'].textContent = activeAlerts.length;
    this.fields.alerts.innerHTML = activeAlerts.length ? activeAlerts.slice(0, 5).map(item => `<button data-alert="${item.id}"><time>${item.time}</time><b class="level-${item.level}">[${item.level}]</b><span>${item.message}</span></button>`).join('') : '<p class="empty-state">当前没有需要处理的告警</p>';
    const eta=s.mining.rate>0?`${fmt(Math.max(0,s.mission.plannedYield-s.mission.extracted)/s.mining.rate*60)} min`:'待启动';
    this.fields.overview.innerHTML = `<dt>站点</dt><dd>${s.mission.site}</dd><dt>区域</dt><dd>${s.mission.area}</dd><dt>计划产量</dt><dd>${fmt(s.mission.plannedYield, 1)} t</dd><dt>当前产量</dt><dd>${fmt(s.mission.extracted, 2)} t</dd><dt>已用时间</dt><dd>${hhmmss(s.clock.missionSeconds)}</dd><dt>预计完成</dt><dd>${eta}</dd><dt>任务进度</dt><dd>${fmt(s.mission.progress)}%</dd><dt>环境</dt><dd class="${s.environment.turbidity > 70 ? 'bad' : 'good'}">● ${s.environment.turbidity > 70 ? '超出阈值' : '阈值内'}</dd>`;
    const target = s.target; this.fields.target.hidden = !target;
    if (target) this.fields.target.innerHTML = `<h3>TARGET</h3><strong>${target.type || target.classification || '未知目标'}</strong><div>置信度 <b>${target.confidence || '—'}${Number.isFinite(target.confidence) ? '%' : ''}</b></div><div>品位 <b>${target.grade || '待分析'}</b></div><div>质量 / 距离 <b>${target.mass ? `${fmt(target.mass, 2)} kg` : target.distance ? `${fmt(target.distance)} m` : '—'}</b></div>`;
    for (const button of this.root.querySelectorAll('[data-workspace]')) button.classList.toggle('active', button.dataset.workspace === s.ui.workspaceMode);
    for (const button of this.root.querySelectorAll('[data-view]')) button.classList.toggle('active', button.dataset.view === s.ui.viewMode);
    for (const button of this.root.querySelectorAll('[data-map-layer]')) button.classList.toggle('active', s.ui.mapLayers[button.dataset.mapLayer]);
    for (const overlay of this.root.querySelectorAll('[data-overlay]')) overlay.hidden = overlay.dataset.overlay !== s.ui.viewMode;
    for (const button of this.root.querySelectorAll('[data-control]')) button.classList.toggle('active', button.dataset.control === s.vehicle.controlMode);
    for (const button of this.root.querySelectorAll('[data-vehicle]')) { const profile = s.vehicle.profiles[button.dataset.vehicle]; button.classList.toggle('active', button.dataset.vehicle === s.vehicle.activeId); button.classList.toggle('locked', !profile.unlocked); }
    for (const button of this.root.querySelectorAll('[data-tool="collector"],[data-tool="pump"]')) button.classList.toggle('locked', !s.vehicle.profiles.C01.unlocked);
    for (const button of this.root.querySelectorAll('[data-tool]')) button.classList.toggle('active', button.dataset.tool === s.mining.tool);
    const emergency = this.root.querySelector('.emergency-button'); emergency.classList.toggle('armed', s.vehicle.emergency); emergency.innerHTML = s.vehicle.emergency ? '↻ 重新武装' : '◉ 紧急停止';
    sparkline(this.root.querySelector('[data-chart="rate"]'), s.analytics.rate, '#31e7c8');
    sparkline(this.root.querySelector('[data-chart="power"]'), s.analytics.power, '#5dc7ff');
    sparkline(this.root.querySelector('[data-chart="depth"]'), s.analytics.depth, '#62d2ef');
    sparkline(this.root.querySelector('[data-chart="lifetime"]'), [...Object.values(s.analytics.lifetime), ...Object.values(s.resources)], '#e6b83f');
  }
  drawMaps(app, state) {
    for (const canvas of [this.fields['mini-map'], this.fields['full-map'], this.fields['bottom-map']]) {
      if (!canvas) continue; const rect = canvas.getBoundingClientRect(), width = Math.max(32, Math.floor(rect.width)), height = Math.max(32, Math.floor(rect.height));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const ctx = canvas.getContext('2d'), cells = canvas === this.fields['mini-map'] ? 18 : 36; ctx.clearRect(0, 0, width, height);
      for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
        const wx = (x / (cells - 1) - .5) * 140, wz = (y / (cells - 1) - .5) * 140 + 56;
        const h = app.seabed.heightAt(wx, wz), mineral = state.ui.mapLayers.resource ? Math.max(0, 1 - Math.hypot(wx - app.field.center.x, wz - app.field.center.z) / 35) : 0;
        const shade = Math.round(26 + (h + 8) * 4), red = Math.round(10 + mineral * 170), green = Math.round(50 + mineral * 115);
        ctx.fillStyle = mineral > .15 ? `rgb(${red},${green},${Math.max(22, 92 - red / 3)})` : state.ui.mapLayers.topo ? `rgb(4,${clamp(shade, 18, 78)},${clamp(shade + 18, 28, 105)})` : '#031018';
        ctx.fillRect(x * width / cells, y * height / cells, Math.ceil(width / cells) + 1, Math.ceil(height / cells) + 1);
      }
      const px = (state.telemetry.x / 140 + .5) * width, py = ((state.telemetry.z - 56) / 140 + .5) * height;
      ctx.save(); ctx.translate(px, py); ctx.rotate(-state.telemetry.heading * Math.PI / 180); ctx.fillStyle = '#e9f7ff'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-5, 6); ctx.lineTo(5, 6); ctx.closePath(); ctx.fill(); ctx.restore();
      if(state.ui.mapLayers.waypoints){const waypoint=state.navigation.waypoint||{x:0,z:112},wx=(waypoint.x/140+.5)*width,wy=((waypoint.z-56)/140+.5)*height;
      ctx.strokeStyle = '#ffe067'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(wx, wy); ctx.stroke(); ctx.setLineDash([]);ctx.strokeStyle='#fff39a';ctx.strokeRect(wx-4,wy-4,8,8);}
    }
  }
}
