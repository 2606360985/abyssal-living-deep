import * as THREE from 'three';
import { CONFIG } from '../config.js';

/** A small damped controller, intentionally not a rigid-body simulation. */
export class Motion {
  constructor(rov, heightAt) {
    this.rov = rov; this.heightAt = heightAt; this.velocity = new THREE.Vector3(); this.yawVelocity = 0; this.yaw = 0;
    this.reset();
  }
  reset() {
    this.rov.root.position.set(0, this.heightAt(0, 0) + 4, 0);
    this.rov.root.rotation.set(0, 0, 0); this.velocity.set(0, 0, 0); this.yaw = this.yawVelocity = 0;
  }
  update(dt, keys, time) {
    const axis = (positive, negative) => Number(keys.has(positive)) - Number(keys.has(negative));
    const turn = axis('KeyA', 'KeyD'), thrust = axis('KeyW', 'KeyS'), vertical = axis('KeyE', 'KeyQ');
    this.yawVelocity = THREE.MathUtils.damp(this.yawVelocity, turn * CONFIG.yawSpeed, 2.2, dt);
    this.yaw += this.yawVelocity * dt;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, Math.sin(this.yaw) * thrust * CONFIG.speed, 1.3, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, Math.cos(this.yaw) * thrust * CONFIG.speed, 1.3, dt);
    this.velocity.y = THREE.MathUtils.damp(this.velocity.y, vertical * CONFIG.verticalSpeed, 1.8, dt);
    const p = this.rov.root.position;
    p.addScaledVector(this.velocity, dt);
    const limit = CONFIG.terrainSize / 2 - 28;
    p.x = THREE.MathUtils.clamp(p.x, -limit, limit); p.z = THREE.MathUtils.clamp(p.z, -limit, limit);
    const minimum = this.heightAt(p.x, p.z) + CONFIG.clearance;
    if (p.y < minimum) { p.y = minimum; this.velocity.y = Math.max(0, this.velocity.y); }
    p.y = Math.min(p.y, 28);
    const r = this.rov.root.rotation;
    r.y = this.yaw;
    r.x = THREE.MathUtils.damp(r.x, this.velocity.length() * 0.009 + Math.sin(time * 0.53) * 0.006, 2, dt);
    r.z = THREE.MathUtils.damp(r.z, -this.yawVelocity * 0.045 + Math.sin(time * 0.41) * 0.006, 2, dt);
    this.rov.rotors.forEach((rotor, i) => { rotor.rotation.z += dt * (i % 2 ? -1 : 1) * (2 + this.velocity.length() * 10 + Math.abs(this.yawVelocity) * 12); });
  }
}
