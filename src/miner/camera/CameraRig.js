import * as THREE from 'three';

export class CameraRig {
  constructor(camera, canvas, rov, heightAt) {
    this.camera = camera; this.rov = rov; this.heightAt = heightAt; this.mode = 'follow';
    this.look = new THREE.Vector3(); this.desired = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.offset = new THREE.Vector3(-6.5, 2.8, -7.8); this.lookOffset = new THREE.Vector3(0, -0.5, 3.2);
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ'); this.direction = new THREE.Vector3(); this.dragging = false;
    canvas.addEventListener('pointerdown', e => {
      if (this.mode !== 'free' || e.button !== 0) return;
      this.dragging = true; canvas.setPointerCapture(e.pointerId); this.euler.setFromQuaternion(camera.quaternion, 'YXZ');
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.dragging || this.mode !== 'free') return;
      this.euler.y -= e.movementX * 0.003; this.euler.x = THREE.MathUtils.clamp(this.euler.x - e.movementY * 0.003, -1.45, 1.45);
      camera.quaternion.setFromEuler(this.euler);
    });
    const release = () => { this.dragging = false; };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('lostpointercapture', release); window.addEventListener('blur', release);
    this.reset();
  }
  reset() { this.mode = 'follow'; this.offset.set(-6.5, 2.8, -7.8); this.lookOffset.set(0, -0.5, 3.2); this.update(1, 0, new Set(), true); }
  setMode(mode) { this.mode = mode; this.dragging = false; }
  update(dt, time, keys, snap = false) {
    const camera = this.camera;
    if (this.mode === 'free') {
      const speed = keys.has('ShiftLeft') ? 9 : 3;
      this.direction.set(Number(keys.has('KeyD')) - Number(keys.has('KeyA')), 0, Number(keys.has('KeyS')) - Number(keys.has('KeyW')));
      if (this.direction.lengthSq()) this.direction.normalize().applyQuaternion(camera.quaternion);
      this.direction.y += Number(keys.has('KeyE')) - Number(keys.has('KeyQ'));
      camera.position.addScaledVector(this.direction, dt * speed);
    } else {
      if (this.mode === 'cinematic') {
        this.desired.set(-6.5 + Math.sin(time * 0.095) * 2.4, 2.5 + Math.sin(time * 0.07) * 0.6, -6.7 + Math.cos(time * 0.095) * 1.3);
      } else this.desired.copy(this.offset);
      this.desired.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.rov.root.rotation.y).add(this.rov.root.position);
      this.target.copy(this.lookOffset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.rov.root.rotation.y).add(this.rov.root.position);
      const alpha = snap ? 1 : 1 - Math.exp(-dt * 2.3);
      camera.position.lerp(this.desired, alpha); this.look.lerp(this.target, alpha); camera.lookAt(this.look);
    }
    camera.position.y = Math.max(camera.position.y, this.heightAt(camera.position.x, camera.position.z) + 0.45);
    camera.updateMatrixWorld();
  }
}
