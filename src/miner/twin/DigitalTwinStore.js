const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const nowTime = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

export const SAVE_KEY = 'abyss-miner.save.v1';

export class SaveRepository {
  constructor(storage = globalThis.localStorage) { this.storage = storage; }
  defaults() {
    return {
      version: 1,
      lifetimeYield: { Ni: 0, Co: 0, Cu: 0, Mn: 0 },
      unlockedVehicles: ['A07'], completedMissions: [],
      settings: { audioMuted: false, reducedMotion: false },
      totals: { operatingSeconds: 0, cargoTonnes: 0, samples: 0 },
    };
  }
  load() {
    try {
      const parsed = JSON.parse(this.storage?.getItem(SAVE_KEY) || 'null');
      if (!parsed || parsed.version !== 1) return this.defaults();
      const base = this.defaults();
      return {
        ...base, ...parsed,
        lifetimeYield: { ...base.lifetimeYield, ...parsed.lifetimeYield },
        settings: { ...base.settings, ...parsed.settings },
        totals: { ...base.totals, ...parsed.totals },
      };
    } catch { return this.defaults(); }
  }
  save(value) { try { this.storage?.setItem(SAVE_KEY, JSON.stringify(value)); } catch {} }
  clear() { try { this.storage?.removeItem(SAVE_KEY); } catch {} }
}

function logEntry(level, source, message) {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, time: nowTime(), level, source, message };
}

function baseState(save, demo = false) {
  const demoResources = demo ? { Ni: 38.3, Co: 10.4, Cu: 24.4, Mn: 1668.9 } : { Ni: 0, Co: 0, Cu: 0, Mn: 0 };
  const unlocked = new Set(save.unlockedVehicles || ['A07']);
  if (demo) unlocked.add('C01');
  return {
    version: 1,
    clock: { startedAt: Date.now(), utc: new Date().toISOString(), missionSeconds: demo ? 12 * 3600 + 374 : 0 },
    ui: { workspaceMode: 'explore', viewMode: 'external', visible: true, performance: false, selectedSystem: 'navigation', mapLayers: { topo: true, resource: true, waypoints: true } },
    vehicle: {
      activeId: 'A07', controlMode: 'manual', emergency: false,
      profiles: {
        A07: { id: 'A07', name: 'A-07', type: '作业级 ROV', role: '勘探 / 采样', unlocked: true, color: '#d3a72f' },
        C01: { id: 'C01', name: 'C-01', type: '深海采集器', role: '连续开采', unlocked: unlocked.has('C01'), color: '#cf6d2e' },
      },
    },
    telemetry: { depth: 3800, altitude: 4, heading: 0, speed: 0, thrust: 0, x: 0, y: 0, z: 0 },
    navigation: { waypoint: null },
    target: null,
    sample: null,
    mission: {
      id: 'KRONOS-1', site: 'CCZ-A7', area: '克拉里昂-克利珀顿区',
      objective: '识别结核并完成 5 吨试采', status: '勘探中', progress: demo ? 72 : 5,
      plannedYield: 5, extracted: 0, completed: false,
      objectives: [
        { id: 'survey', label: '声呐扫描矿区', done: demo },
        { id: 'sample', label: '获取并分析样本', done: demo },
        { id: 'deploy', label: '部署 C-01 采集器', done: demo },
        { id: 'extract', label: '完成 5 吨试采', done: false },
      ],
    },
    mining: { active: false, eligible: false, rate: demo ? 142 : 0, pumpLoad: demo ? 78 : 0, tool: 'collector', extracted: 0 },
    cargo: { current: demo ? 1742 : 0, capacity: 3000, level: demo ? 58.07 : 0 },
    resources: demoResources,
    environment: { temperature: 2.1, pressure: 380, salinity: 34.7, oxygen: 5.8, current: 0.18, turbidity: demo ? 46 : 8, plume: demo ? 31 : 4 },
    power: { total: demo ? 1275 : 420, available: 2000, propulsion: 180, pump: demo ? 620 : 0, tools: 80, other: 160, reserve: demo ? 36.25 : 79 },
    health: { hull: 100, thrusters: 98, manipulators: 96, drill: 92, pump: 88, power: 94, comms: 100 },
    systems: {
      navigation: { label: '导航 DVL/INS', status: 'online', load: 34, power: 85, temperature: 38, vibration: .2, fault: '无' },
      sonar: { label: '声呐 / 测绘', status: 'online', load: 28, power: 120, temperature: 42, vibration: .1, fault: '无' },
      manipulator: { label: '机械臂控制', status: 'online', load: 12, power: 95, temperature: 36, vibration: .5, fault: '无' },
      mining: { label: '采矿工具', status: demo ? 'online' : 'standby', load: demo ? 72 : 0, power: demo ? 280 : 0, temperature: demo ? 61 : 29, vibration: demo ? 3.8 : .1, fault: '无' },
      pump: { label: '泵与浆体输送', status: demo ? 'warning' : 'standby', load: demo ? 78 : 0, power: demo ? 620 : 0, temperature: demo ? 69 : 28, vibration: demo ? 4.7 : .2, fault: '无' },
      comms: { label: '光纤通信', status: 'online', load: 18, power: 42, temperature: 33, vibration: 0, fault: '无' },
    },
    logs: demo ? [
      logEntry('OK', 'NAV', 'ROV 已抵达目标区域。'),
      logEntry('INFO', 'SONAR', '识别到多金属结核矿区。'),
      logEntry('OK', 'MINING', 'C-01 采集器进入连续作业。'),
    ] : [logEntry('INFO', 'SYSTEM', '数字孪生链路已建立。')],
    alerts: demo ? [
      { ...logEntry('WARN', 'ENV', '颗粒物密度升高，正在监控羽流。'), acknowledged: false },
      { ...logEntry('INFO', 'MINING', '泵负载接近任务推荐区间。'), acknowledged: false },
    ] : [],
    analytics: {
      rate: demo ? [72, 88, 110, 103, 126, 141, 136, 151, 142] : [],
      power: demo ? [980, 1040, 1180, 1130, 1250, 1290, 1275] : [],
      pump: demo ? [52, 58, 66, 63, 74, 81, 78] : [],
      depth: [], temperature: [], lifetime: { ...save.lifetimeYield },
    },
  };
}

export class DigitalTwinStore {
  constructor({ save = new SaveRepository().load(), demo = false } = {}) {
    this.save = save;
    this.demo = demo;
    this.state = baseState(save, demo);
    this.listeners = new Set();
  }
  getSnapshot() { return this.state; }
  subscribe(selector, listener) {
    const entry = { selector: selector || (state => state), listener };
    this.listeners.add(entry); listener(entry.selector(this.state));
    return () => this.listeners.delete(entry);
  }
  notify() { for (const { selector, listener } of this.listeners) listener(selector(this.state)); }
  addLog(level, source, message) {
    this.state.logs.unshift(logEntry(level, source, message));
    this.state.logs.length = Math.min(this.state.logs.length, 40);
  }
  raiseAlert(level, source, message, key = `${source}:${message}`) {
    if (this.state.alerts.some(alert => alert.key === key && !alert.acknowledged)) return;
    this.state.alerts.unshift({ ...logEntry(level, source, message), key, acknowledged: false });
    this.state.alerts.length = Math.min(this.state.alerts.length, 24);
  }
  dispatch(type, data = {}) {
    const s = this.state;
    switch (type) {
      case 'runtime.telemetry': Object.assign(s.telemetry, data); break;
      case 'runtime.target': s.target = data.target || null; break;
      case 'runtime.clock': Object.assign(s.clock, data); break;
      case 'ui.workspace': s.ui.workspaceMode = data.mode; break;
      case 'ui.view': s.ui.viewMode = data.mode; break;
      case 'ui.visibility': s.ui.visible = data.visible; break;
      case 'ui.performance': s.ui.performance = data.visible; break;
      case 'ui.system': s.ui.selectedSystem = data.id; s.ui.viewMode = 'model'; break;
      case 'ui.mapLayer': s.ui.mapLayers[data.layer] = !s.ui.mapLayers[data.layer]; break;
      case 'control.mode': s.vehicle.controlMode = data.mode; this.addLog('INFO', 'CONTROL', `控制模式切换为 ${data.mode.toUpperCase()}。`); break;
      case 'navigation.waypoint': s.navigation.waypoint = { x: data.x, z: data.z }; this.addLog('INFO', 'NAV', `新航点已设置：X ${data.x.toFixed(0)} / Z ${data.z.toFixed(0)}。`); break;
      case 'vehicle.switch':
        if (!s.vehicle.profiles[data.id]?.unlocked || s.vehicle.emergency) break;
        s.vehicle.activeId = data.id; s.mining.active = false; s.mining.tool = data.id === 'C01' ? 'collector' : 'sonar';
        if (data.id === 'C01') { s.mission.objectives.find(item => item.id === 'deploy').done = true; s.mission.progress = Math.max(s.mission.progress, 60); s.mission.status = '采集器部署'; }
        this.addLog('OK', 'VEHICLE', `控制权切换至 ${s.vehicle.profiles[data.id].name}。`); break;
      case 'vehicle.unlock':
        if (s.vehicle.profiles[data.id]) s.vehicle.profiles[data.id].unlocked = true;
        this.addLog('OK', 'MISSION', `${s.vehicle.profiles[data.id]?.name || data.id} 已解锁。`); break;
      case 'sonar.ping':
        s.target = data.snapshot || s.target;
        if (data.snapshot?.classification?.includes('多金属')) { s.mission.objectives.find(item => item.id === 'survey').done = true; s.mission.progress = Math.max(s.mission.progress, 20); s.mission.status = '矿区确认'; }
        this.addLog('INFO', 'SONAR', data.snapshot ? `回波锁定：${data.snapshot.classification}。` : '主动声呐已发射。'); break;
      case 'sample.acquired': {
        s.sample = data.sample;
        s.mission.objectives.find(item => item.id === 'sample').done = true;
        s.vehicle.profiles.C01.unlocked = true;
        s.mission.progress = Math.max(s.mission.progress, 45); s.mission.status = '样本已确认';
        this.addLog('OK', 'SAMPLE', `样本 ${data.sample.id} 已存入压力容器。`);
        break;
      }
      case 'mining.eligibility': s.mining.eligible = data.eligible; break;
      case 'tool.select':
        if (['collector','pump'].includes(data.tool) && !s.vehicle.profiles.C01.unlocked) break;
        s.mining.tool = data.tool; break;
      case 'mining.toggle':
        if (s.vehicle.emergency || !s.mining.eligible || s.vehicle.activeId !== 'C01') {
          this.addLog('WARN', 'MINING', '采集器启动条件未满足。'); break;
        }
        s.mining.active = data.active ?? !s.mining.active;
        this.addLog(s.mining.active ? 'OK' : 'INFO', 'MINING', s.mining.active ? '采集头与吸矿泵已启动。' : '采集系统已停止。'); break;
      case 'simulation.tick': {
        const { dt, rate, pumpLoad, totalPower, turbidity, plume } = data;
        s.mining.rate = rate; s.mining.pumpLoad = pumpLoad;
        s.power.total = totalPower; s.power.pump = s.mining.active ? Math.round(pumpLoad * 8) : 0;
        s.power.propulsion = Math.round(160 + s.telemetry.thrust * 5.4);
        s.power.reserve = clamp((s.power.available - totalPower) / s.power.available * 100, 0, 100);
        s.environment.turbidity = turbidity; s.environment.plume = plume;
        if (s.mining.active && rate > 0) {
          const tonnes = Math.min(rate * dt / 3600, s.cargo.capacity - s.cargo.current);
          s.cargo.current += tonnes; s.mining.extracted += tonnes; s.mission.extracted += tonnes;
          const composition = { Ni: .022, Co: .006, Cu: .014, Mn: .958 };
          for (const [key, fraction] of Object.entries(composition)) s.resources[key] += tonnes * fraction;
          s.cargo.level = s.cargo.current / s.cargo.capacity * 100;
          s.mission.progress = clamp(60 + s.mission.extracted / s.mission.plannedYield * 40, 0, 100);
          if (s.mission.extracted >= s.mission.plannedYield && !s.mission.completed) {
            s.mission.completed = true; s.mission.status = '任务完成'; s.mining.active = false;
            s.mission.objectives.find(item => item.id === 'extract').done = true;
            this.addLog('OK', 'MISSION', 'KRONOS-1 试采目标已完成。');
          }
        }
        s.systems.mining.status = s.mining.active ? 'online' : 'standby'; s.systems.mining.load = Math.round(rate / 1.8);
        s.systems.pump.status = pumpLoad >= 95 ? 'error' : pumpLoad >= 85 ? 'warning' : s.mining.active ? 'online' : 'standby'; s.systems.pump.load = Math.round(pumpLoad);
        s.systems.mining.power = s.mining.active ? 280 : 0; s.systems.mining.temperature = s.mining.active ? 52 + rate * .06 : 29; s.systems.mining.vibration = s.mining.active ? 2.1 + rate * .012 : .1;
        s.systems.pump.power = s.power.pump; s.systems.pump.temperature = s.mining.active ? 39 + pumpLoad * .38 : 28; s.systems.pump.vibration = s.mining.active ? pumpLoad * .062 : .2;
        if (s.mining.active) {
          s.health.pump = clamp(s.health.pump - dt * pumpLoad * .000006, 0, 100);
          s.health.power = clamp(s.health.power - dt * .00008, 0, 100);
        }
        break;
      }
      case 'analytics.sample':
        for (const key of ['rate', 'power', 'pump', 'depth', 'temperature']) {
          if (data[key] == null) continue; s.analytics[key].push(data[key]); if (s.analytics[key].length > 48) s.analytics[key].shift();
        }
        break;
      case 'alert.raise': this.raiseAlert(data.level, data.source, data.message, data.key); break;
      case 'alert.acknowledge': { const alert = s.alerts.find(item => item.id === data.id); if (alert) alert.acknowledged = true; break; }
      case 'emergency.stop':
        s.vehicle.emergency = true; s.mining.active = false; s.vehicle.controlMode = 'hold';
        this.raiseAlert('CRITICAL', 'CONTROL', '紧急停止已触发，所有执行系统冻结。', 'emergency');
        this.addLog('CRITICAL', 'CONTROL', 'EMERGENCY STOP。'); break;
      case 'emergency.rearm':
        s.vehicle.emergency = false; s.vehicle.controlMode = 'manual';
        for (const alert of s.alerts) if (alert.key === 'emergency') alert.acknowledged = true;
        this.addLog('OK', 'CONTROL', '执行系统已重新武装。'); break;
      case 'mission.reset': {
        const fresh = baseState(this.save, false);
        fresh.analytics.lifetime = data.keepCareer === false ? { Ni: 0, Co: 0, Cu: 0, Mn: 0 } : { ...s.analytics.lifetime };
        fresh.vehicle.profiles.C01.unlocked = data.keepCareer === false ? false : s.vehicle.profiles.C01.unlocked;
        this.state = fresh; break;
      }
      default: throw new Error(`Unknown twin event: ${type}`);
    }
    this.notify();
  }
}
