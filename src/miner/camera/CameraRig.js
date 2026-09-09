import * as THREE from 'three';

export class CameraRig {
  constructor(camera, canvas, rov, heightAt, obstacles = []) {
    this.camera = camera; this.rov = rov; this.heightAt = heightAt; this.mode = 'follow';
    this.look = new THREE.Vector3(); this.desired = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.offset = new THREE.Vector3(-6.5, 2.8, -7.8); this.lookOffset = new THREE.Vector3(0, -0.5, 3.2);
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ'); this.direction = new THREE.Vector3(); this.dragging = false;
    this.orbiting = false; this.orbitYaw = 0; this.orbitPitch = 0;
    this.obstacles=obstacles;this.ray=new THREE.Ray();this.hit=new THREE.Vector3();this.cameraVelocity=new THREE.Vector3();this.cinematicIndex=0;
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (this.mode === 'free') { this.dragging = true; canvas.setPointerCapture(e.pointerId); this.euler.setFromQuaternion(camera.quaternion, 'YXZ'); }
      else if (this.mode === 'follow') { this.orbiting = true; }
    });
    canvas.addEventListener('pointermove', e => {
      if (this.dragging && this.mode === 'free') {
        this.euler.y -= e.movementX * 0.003; this.euler.x = THREE.MathUtils.clamp(this.euler.x - e.movementY * 0.003, -1.45, 1.45);
        camera.quaternion.setFromEuler(this.euler);
      } else if (this.orbiting && this.mode === 'follow') {
        this.orbitYaw -= e.movementX * 0.005;
        this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + e.movementY * 0.004, -0.6, 1.0);
      }
    });
    const release = () => { this.dragging = false; this.orbiting = false; };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('lostpointercapture', release); window.addEventListener('blur', release);
    this.reset();
  }
  reset() { this.mode = 'follow'; this.offset.set(-6.5, 2.8, -7.8); this.lookOffset.set(0, -0.5, 3.2); this.orbitYaw = 0; this.orbitPitch = 0; this.update(1, 0, new Set(), true); }
  setMode(mode) { this.mode = mode; this.dragging = false; this.orbiting = false; this.orbitYaw = 0; this.orbitPitch = 0; this.cameraVelocity.set(0,0,0); }
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
      const yaw = this.rov.root.rotation.y + (this.mode === 'follow' ? this.orbitYaw : 0);
      if (this.mode === 'follow' && this.orbitPitch !== 0) {
        const hd = Math.sqrt(this.desired.x * this.desired.x + this.desired.z * this.desired.z);
        const baseAngle = Math.atan2(this.desired.y, hd);
        const dist = this.desired.length();
        const newAngle = THREE.MathUtils.clamp(baseAngle + this.orbitPitch, -0.3, 1.35);
        this.desired.y = Math.sin(newAngle) * dist;
        const newHd = Math.cos(newAngle) * dist;
        const scale = hd > 0.001 ? newHd / hd : 1;
        this.desired.x *= scale; this.desired.z *= scale;
      }
      this.desired.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(this.rov.root.position);
      this.target.copy(this.rov.root.position).add(new THREE.Vector3(0, 0.15, 0));
      this.ray.origin.copy(this.rov.root.position);this.ray.direction.copy(this.desired).sub(this.ray.origin).normalize();
      let maxDistance=this.desired.distanceTo(this.ray.origin);
      for(const sphere of this.obstacles){
        if(this.ray.origin.distanceToSquared(sphere.center)<(sphere.radius+1)**2)continue;
        if(this.ray.intersectSphere(sphere,this.hit)){const d=this.hit.distanceTo(this.ray.origin)-.65;if(d>2&&d<maxDistance)maxDistance=d;}
      }
      this.desired.copy(this.ray.direction).multiplyScalar(maxDistance).add(this.ray.origin);
      const alpha = snap ? 1 : 1 - Math.exp(-dt * 2.3);
      if(snap){camera.position.copy(this.desired);this.cameraVelocity.set(0,0,0);}
      else {const h=Math.min(dt,.033);this.cameraVelocity.addScaledVector(this.direction.copy(this.desired).sub(camera.position),h*22);this.cameraVelocity.multiplyScalar(Math.exp(-h*9));camera.position.addScaledVector(this.cameraVelocity,h);}
      this.look.lerp(this.target, alpha); camera.lookAt(this.look);
    }
    camera.position.y = Math.max(camera.position.y, this.heightAt(camera.position.x, camera.position.z) + 0.45);
    camera.updateMatrixWorld();
  }
}
