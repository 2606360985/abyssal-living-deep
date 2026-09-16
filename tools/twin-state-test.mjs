import assert from 'node:assert/strict';
import { DigitalTwinStore, SaveRepository, SAVE_KEY } from '../src/miner/twin/DigitalTwinStore.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const storage = new MemoryStorage(), repository = new SaveRepository(storage), defaults = repository.load();
assert.equal(defaults.version, 1); assert.deepEqual(defaults.unlockedVehicles, ['A07']); assert.equal(defaults.credits, 0); assert.deepEqual(defaults.upgrades, { collector: 0, pump: 0, cargo: 0 });
repository.save({ ...defaults, unlockedVehicles: ['A07', 'C01'] }); assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).unlockedVehicles[1], 'C01');
repository.clear(); assert.equal(storage.getItem(SAVE_KEY), null);

const store = new DigitalTwinStore({ save: defaults });
let notifications = 0; const unsubscribe = store.subscribe(state => state.vehicle.activeId, () => notifications++);
store.dispatch('vehicle.switch', { id: 'C01' }); assert.equal(store.getSnapshot().vehicle.activeId, 'A07');
const sample = { id: 'N-001', mass: 2, value: 4200, composition: { Ni: 2, Co: .5, Cu: 1.5, Mn: 96 } };
store.dispatch('sample.acquired', { sample }); assert.equal(store.getSnapshot().sample.id, 'N-001'); assert.equal(store.getSnapshot().vehicle.profiles.C01.unlocked, true);
store.dispatch('vehicle.switch', { id: 'C01' }); assert.equal(store.getSnapshot().vehicle.activeId, 'C01');
store.dispatch('mining.eligibility', { eligible: true }); store.dispatch('mining.toggle', { active: true });
store.dispatch('simulation.tick', { dt: 3600, rate: 100, pumpLoad: 86, totalPower: 1400, turbidity: 75, plume: 50 });
assert.equal(store.getSnapshot().cargo.current, 100); assert.ok(Math.abs(store.getSnapshot().resources.Ni - 2.2) < 1e-9); assert.equal(store.getSnapshot().mining.extracted, 100);
assert.equal(store.getSnapshot().mission.completed, true); assert.equal(store.getSnapshot().economy.credits, 800);
store.dispatch('upgrade.purchase', { id: 'collector' }); assert.equal(store.getSnapshot().upgrades.collector.level, 1); assert.equal(store.getSnapshot().economy.credits, 450);
store.dispatch('upgrade.purchase', { id: 'pump' }); assert.equal(store.getSnapshot().upgrades.pump.level, 1); assert.equal(store.getSnapshot().economy.credits, 0);
store.dispatch('emergency.stop'); assert.equal(store.getSnapshot().mining.active, false); assert.equal(store.getSnapshot().vehicle.emergency, true);
store.dispatch('emergency.rearm'); assert.equal(store.getSnapshot().vehicle.controlMode, 'manual');
store.dispatch('alert.raise', { level: 'WARN', source: 'TEST', message: 'dedupe', key: 'same' });
store.dispatch('alert.raise', { level: 'WARN', source: 'TEST', message: 'dedupe', key: 'same' });
assert.equal(store.getSnapshot().alerts.filter(alert => alert.key === 'same').length, 1);
unsubscribe(); assert.ok(notifications > 1);
console.log('DigitalTwinStore, cargo, alerts, emergency stop and save repository checks passed.');
