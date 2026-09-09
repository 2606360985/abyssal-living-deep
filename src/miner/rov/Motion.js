import * as THREE from 'three';
import { CONFIG } from '../config.js';

/** A small damped controller, intentionally not a rigid-body simulation. */
export class Motion {
  constructor(rov, heightAt) {
    this.rov = rov; this.heightAt = heightAt; this.velocity = new THREE.Vector3(); this.yawVelocity = 0; this.yaw = 0;
    this.localVelocity = new THREE.Vector3(); this.thrust = 0; this.verticalThrust = 0;
    this.reset();
  }
  reset() {
    this.rov.root.position.set(0, this.heightAt(0, 0) + 4, 0);
    this.rov.root.rotation.set(0, 0, 0); this.velocity.set(0, 0, 0); this.yaw = this.yawVelocity = 0;
    this.localVelocity.set(0,0,0);this.thrust=0;this.verticalThrust=0;
    this.rov.rotors.forEach(r=>{r.rotation.z=0;});
  }
  update(dt, keys, time) {
    const axis = (positive, negative) => Number(keys.has(positive)) - Number(keys.has(negative));
    const turn = axis('KeyA', 'KeyD'), thrust = axis('KeyW', 'KeyS'), vertical = axis('KeyE', 'KeyQ'), strafe = axis('KeyZ','KeyX');
    this.yawVelocity = THREE.MathUtils.damp(this.yawVelocity, turn * CONFIG.yawSpeed, 2.2, dt);
    this.yaw += this.yawVelocity * dt;
    const speed=thrust>0?CONFIG.speed:CONFIG.speed*.55;
    const targets=[strafe*.8,vertical*CONFIG.verticalSpeed,thrust*speed];
    ['x','y','z'].forEach((axis,i)=>{const old=this.localVelocity[axis],target=targets[i];
      const accel=i===1?.55:i===0?.65:1.05;
      const response=old*target<0?1.5:target===0?.85:1.2;
      this.localVelocity[axis]+=THREE.MathUtils.clamp((target-old)*response,-accel,accel)*dt;
    });
    this.velocity.copy(this.localVelocity).applyAxisAngle(THREE.Object3D.DEFAULT_UP,this.yaw);
    this.thrust=THREE.MathUtils.damp(this.thrust,Math.min(1,Math.abs(thrust)+Math.abs(vertical)*.8+Math.abs(turn)*.4+Math.abs(strafe)*.4),4,dt);
    this.verticalThrust=THREE.MathUtils.damp(this.verticalThrust,Math.abs(vertical)*.85+this.thrust*.35,4,dt);
    const p = this.rov.root.position;
    p.addScaledVector(this.velocity, dt);
    const limit = CONFIG.terrainSize / 2 - 28;
    p.x = THREE.MathUtils.clamp(p.x, -limit, limit); p.z = THREE.MathUtils.clamp(p.z, -limit, limit);
    const minimum = this.heightAt(p.x, p.z) + CONFIG.clearance;
    if (p.y < minimum) { p.y = minimum; this.velocity.y = this.localVelocity.y = Math.max(0, this.velocity.y); }
    p.y = Math.min(p.y, 28);
    const r = this.rov.root.rotation;
    r.y = this.yaw;
    r.x = THREE.MathUtils.damp(r.x, this.velocity.length() * 0.009 + Math.sin(time * 0.53) * 0.006, 2, dt);
    r.z = THREE.MathUtils.damp(r.z, -this.yawVelocity * 0.045 + Math.sin(time * 0.41) * 0.006, 2, dt);
    this.rov.rotors.forEach((rotor, i) => { rotor.rotation.z += dt * (i % 2 ? -1 : 1) * (2 + this.thrust * 38); });
    this.rov.blurDiscs?.forEach(d=>{d.material.opacity=this.thrust*.15;});
  }
}
