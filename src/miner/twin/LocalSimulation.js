import { CONFIG } from '../config.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class RuntimeAdapter {
  constructor(app, store) { this.app = app; this.store = store; this.lastSelected = null; }
  sync() {
    const a = this.app, p = a.rov.root.position, floor = a.seabed.heightAt(p.x, p.z);
    const speed = a.motion.velocity.length();
    const heading = ((a.motion.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const depth = CONFIG.depth + a.startY - p.y;
    this.store.dispatch('runtime.telemetry', {
      depth, altitude: p.y - floor, heading, speed, thrust: Math.min(100, speed / CONFIG.speed * 100),
      x: p.x, y: p.y, z: p.z,
    });
    const environment = this.store.getSnapshot().environment;
    environment.temperature = Number((2.1 + Math.sin(a.time * .013) * .08).toFixed(2));
    environment.pressure = Number((depth * .1).toFixed(1));
    environment.current = Number((.16 + Math.sin(a.time * .04) * .04).toFixed(2));
    const selected = a.state.selected || a.field.hover;
    if (selected !== this.lastSelected) {
      this.lastSelected = selected;
      this.store.dispatch('runtime.target', { target: selected ? {
        id: selected.id, type: '多金属结核', confidence: a.state.scanned ? 92 : 68,
        grade: selected.value > 6000 ? '高' : selected.value > 3500 ? '中' : '一般',
        mass: selected.mass, composition: selected.composition, value: selected.value,
      } : a.sonar.snapshot ? { ...a.sonar.snapshot, type: a.sonar.snapshot.classification } : null });
    }
  }
}

export class LocalSimulation {
  constructor(app, store, repository) {
    this.app = app; this.store = store; this.repository = repository;
    this.persisted = { resources: { Ni: 0, Co: 0, Cu: 0, Mn: 0 }, extracted: 0, sample: false, seconds: 0 };
    this.adapter = new RuntimeAdapter(app, store); this.credit = 0; this.chartCredit = 0; this.saveCredit = 0;
  }
  update(dt) {
    this.credit += dt; this.chartCredit += dt; this.saveCredit += dt;
    if (this.credit < .1) return;
    const step = this.credit; this.credit = 0;
    this.adapter.sync();
    const s = this.store.getSnapshot(), a = this.app;
    s.clock.missionSeconds += step;
    s.clock.utc = new Date().toISOString();
    const distance = a.rov.root.position.distanceTo(a.field.center);
    const eligible = s.vehicle.activeId === 'C01' && a.state.scanned && distance < 26 && !s.vehicle.emergency;
    if (eligible !== s.mining.eligible) this.store.dispatch('mining.eligibility', { eligible });
    if (!eligible && s.mining.active) this.store.dispatch('mining.toggle', { active: false });

    const efficiency = eligible ? clamp(1 - Math.max(0, distance - 8) / 24, .55, 1) : 0;
    const collectorLevel = s.upgrades.collector.level, pumpLevel = s.upgrades.pump.level;
    const rateMultiplier = 1 + collectorLevel * .25 + pumpLevel * .1;
    const rate = s.mining.active ? 142 * efficiency * rateMultiplier : 0;
    const pumpLoad = s.mining.active ? (72 + efficiency * 14 + Math.sin(a.time * .35) * 3) * (1 - pumpLevel * .055) : Math.max(0, s.mining.pumpLoad - step * 35);
    const totalPower = Math.round(360 + s.telemetry.thrust * 5.2 + (s.mining.active ? 620 + pumpLoad * 3.2 - pumpLevel * 55 : 0));
    const turbidityTarget = s.mining.active ? 48 + pumpLoad * .42 : 8 + Math.min(28, a.sediment.alive / 32);
    const turbidity = s.environment.turbidity + (turbidityTarget - s.environment.turbidity) * Math.min(1, step * .8);
    const plumeTarget = s.mining.active ? 24 + pumpLoad * .32 : 4;
    const plume = s.environment.plume + (plumeTarget - s.environment.plume) * Math.min(1, step * .45);
    this.store.dispatch('simulation.tick', { dt: step, rate, pumpLoad, totalPower, turbidity, plume });

    const current = this.store.getSnapshot();
    if (current.cargo.level >= 100 && current.mining.active) this.store.dispatch('mining.toggle', { active: false });
    if (current.cargo.level >= 95) this.store.dispatch('alert.raise', { level: 'CRITICAL', source: 'CARGO', message: '货舱容量达到 95%，请停止采集。', key: 'cargo-critical' });
    else if (current.cargo.level >= 80) this.store.dispatch('alert.raise', { level: 'WARN', source: 'CARGO', message: '货舱容量超过 80%。', key: 'cargo-warning' });
    if (current.mining.pumpLoad >= 95) this.store.dispatch('alert.raise', { level: 'CRITICAL', source: 'PUMP', message: '吸矿泵处于严重过载状态。', key: 'pump-critical' });
    else if (current.mining.pumpLoad >= 85) this.store.dispatch('alert.raise', { level: 'WARN', source: 'PUMP', message: '吸矿泵负载偏高。', key: 'pump-warning' });
    if (current.power.reserve < 10) this.store.dispatch('alert.raise', { level: 'WARN', source: 'POWER', message: '可用功率余量低于 10%。', key: 'power-low' });
    if (current.environment.turbidity > 70) this.store.dispatch('alert.raise', { level: 'WARN', source: 'ENV', message: '浑浊度超过环境作业阈值。', key: 'turbidity-high' });

    if (this.chartCredit >= 1) {
      this.chartCredit %= 1;
      this.store.dispatch('analytics.sample', {
        rate: current.mining.rate, power: current.power.total, pump: current.mining.pumpLoad,
        depth: current.telemetry.depth, temperature: current.environment.temperature,
      });
    }
    if (this.saveCredit >= 5 || (current.mission.completed&&!this.completedPersisted)) { this.saveCredit = 0; this.persist(); this.completedPersisted=current.mission.completed; }
  }
  persist() {
    if(this.store.demo)return;
    const s = this.store.getSnapshot(), previous = this.repository.load();
    const lifetime = {};
    for (const key of ['Ni', 'Co', 'Cu', 'Mn']) lifetime[key] = previous.lifetimeYield[key] + Math.max(0, s.resources[key] - this.persisted.resources[key]);
    const completed = new Set(previous.completedMissions);
    if (s.mission.completed) completed.add(s.mission.id);
    const saved = {
      ...previous,
      lifetimeYield: lifetime,
      unlockedVehicles: Object.values(s.vehicle.profiles).filter(profile => profile.unlocked).map(profile => profile.id),
      completedMissions: [...completed],
      credits: s.economy.credits,
      upgrades: Object.fromEntries(Object.entries(s.upgrades).map(([id, upgrade]) => [id, upgrade.level])),
      settings: { ...previous.settings, audioMuted: this.app.audio.muted },
      totals: { operatingSeconds: previous.totals.operatingSeconds + Math.max(0, s.clock.missionSeconds - this.persisted.seconds), cargoTonnes: previous.totals.cargoTonnes + Math.max(0, s.mining.extracted - this.persisted.extracted), samples: previous.totals.samples + Number(!!s.sample && !this.persisted.sample) },
    };
    this.repository.save(saved); this.store.save = saved;
    this.persisted = { resources: { ...s.resources }, extracted: s.mining.extracted, sample: !!s.sample, seconds: s.clock.missionSeconds };
  }
  resetSession() { this.persisted = { resources: { Ni: 0, Co: 0, Cu: 0, Mn: 0 }, extracted: 0, sample: false, seconds: 0 }; this.completedPersisted=false; }
}
