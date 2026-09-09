import { STAGES } from './GameState.js';

export class SequenceDirector {
  constructor(app) { this.app = app; this.stages = new Map(); this.time = 0; this.id = null; this.events = new Set(); }
  register(id, stage) { this.stages.set(id, stage); }
  goto(id, { reset = true } = {}) {
    if (typeof id === 'number') id = STAGES[id - 1];
    if (!this.stages.has(id)) return false;
    this.stages.get(this.id)?.exit?.();
    this.app.keys.clear(); this.app.audio.reset(); this.app.hud.clearMessages?.();
    this.time = 0; this.events.clear(); this.id = id;
    if (reset) this.app.resetWorld?.(id);
    this.app.state.dispatch('stageEntered', { stage: id });
    this.stages.get(id).enter?.({ reset });
    return true;
  }
  once(key, condition, action) {
    if (!condition || this.events.has(key)) return;
    this.events.add(key); action();
  }
  update(dt) { this.time += dt; this.stages.get(this.id)?.update?.(dt); }
}
