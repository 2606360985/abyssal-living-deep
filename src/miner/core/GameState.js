export const STAGES = ['descent', 'arrival', 'sonar', 'nodules', 'sampling', 'contact', 'lost'];

/** Small explicit event reducer; debug transitions use the same reset contract. */
export class GameState {
  constructor() { this.dispatch('reset', { stage: 'arrival' }); }
  dispatch(type, data = {}) {
    switch (type) {
      case 'reset': Object.assign(this, { stage: data.stage, discovered: false, scanned: false, selected: null, sample: null, inputLocked: false, contact: null, pingCount: 0 }); break;
      case 'stageEntered': this.stage = data.stage; break;
      case 'sonarPinged': this.pingCount++; break;
      case 'poiDiscovered': this.discovered = true; break;
      case 'fieldScanned': this.scanned = true; break;
      case 'targetSelected': this.selected = data.target; break;
      case 'samplingStarted': this.inputLocked = true; break;
      case 'sampleAcquired': this.sample = data.sample; this.inputLocked = false; break;
      case 'contactUpdated': this.contact = data.contact; break;
      case 'inputLocked': this.inputLocked = data.locked; break;
      default: throw new Error(`Unknown game event: ${type}`);
    }
  }
}
