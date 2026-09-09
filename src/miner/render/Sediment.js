import * as THREE from 'three';

/** Fixed pool: CPU writes spawn data; trajectories and soft intersections run on GPU. */
export class Sediment {
  constructor(pipeline, heightAt, count = 1800) {
    this.count = count; this.heightAt = heightAt; this.cursor = 0; this.credit = 0; this.serial = 1; this.enabled = true;
    this.positions = new Float32Array(count * 3); this.velocity = new Float32Array(count * 3); this.life = new Float32Array(count * 4);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aVelocity', new THREE.BufferAttribute(this.velocity, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.life, 4).setUsage(THREE.DynamicDrawUsage));
    const uniforms = this.uniforms = { ...pipeline.lightUniforms, uTime: { value: 0 }, uDepth: { value: pipeline.target.depthTexture }, uResolution: { value: new THREE.Vector2() }, uNear: { value: .1 }, uFar: { value: 110 }, uRov: { value: new THREE.Vector3() } };
    this.material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, depthTest: false,
      vertexShader: `attribute vec3 aVelocity;attribute vec4 aLife;uniform float uTime;uniform vec2 uResolution;varying float vFade,vDepth;varying vec3 vWorld;
      void main(){float age=uTime-aLife.x;float f=clamp(age/max(.01,aLife.y),0.,1.);
        vec3 p=position+aVelocity*(1.-exp(-max(0.,age)*.55))*1.82;
        p.y+=max(0.,age)*.065+sin(f*3.14159)*.15;
        vWorld=p;vec4 mv=modelViewMatrix*vec4(p,1.);vDepth=-mv.z;
        gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aLife.z*(.35+f*2.)*uResolution.y/max(.5,-mv.z),1.,220.);
        vFade=step(0.,age)*(1.-step(aLife.y,age))*smoothstep(0.,.12,f)*pow(1.-f,1.6)*aLife.w;
      }`,
      fragmentShader: `#include <packing>
      uniform sampler2D uDepth;uniform vec2 uResolution;uniform float uNear,uFar;uniform vec3 uLampPos[2],uLampDir[2],uRov;
      varying float vFade,vDepth;varying vec3 vWorld;
      void main(){vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);if(r>1.||vFade<=0.)discard;
        float depth=-perspectiveDepthToViewZ(texture2D(uDepth,gl_FragCoord.xy/uResolution).x,uNear,uFar);
        float soft=clamp((depth-vDepth)*2.,0.,1.);float light=.14+1.2*exp(-length(vWorld-uRov)*.24);
        for(int i=0;i<2;i++){vec3 d=vWorld-uLampPos[i];light+=smoothstep(.969,.99,dot(normalize(d),uLampDir[i]))*5./(1.+dot(d,d)*.06);}
        float cloud=exp(-r*3.5)*(.85+.15*sin(q.x*13.+sin(q.y*11.)));
        gl_FragColor=vec4(vec3(.17,.19,.16)*light,cloud*vFade*soft);}` });
    this.points = new THREE.Points(this.geometry, this.material); this.points.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.points); pipeline.sediment = this;
    this.reset();
  }
  random() { this.serial = Math.imul(this.serial, 1664525) + 1013904223 >>> 0; return this.serial / 4294967296; }
  emit(position, time, strength = 1, burst = 1) {
    if (!this.enabled) return;
    for (let n = 0; n < burst; n++) {
      const i = this.cursor++ % this.count, angle = this.random() * Math.PI * 2, speed = .35 + this.random() * strength * 1.4;
      const x = position.x + (this.random() - .5) * .55, z = position.z + (this.random() - .5) * .6;
      this.positions.set([x, this.heightAt(x, z) + .05, z], i * 3);
      this.velocity.set([Math.cos(angle) * speed, .03 + this.random() * .08, Math.sin(angle) * speed], i * 3);
      this.life.set([time, 3.5 + this.random() * 3, .55 + this.random() * .8, .19 + strength * .09], i * 4);
    }
    for (const attribute of Object.values(this.geometry.attributes)) attribute.needsUpdate = true;
  }
  update(dt, time, position, thrust, altitude) {
    this.uniforms.uTime.value = time; this.uniforms.uRov.value.copy(position);
    const strength = Math.max(0, 1 - altitude / 5) ** 2 * thrust;
    this.emissionRate = strength * 170; this.credit += this.emissionRate * dt;
    if (this.credit >= 1) { const count = Math.floor(this.credit); this.credit -= count; this.emit(position, time, strength, count); }
    this.points.visible = this.enabled;
  }
  reset() { this.life.fill(0); for (let i = 0; i < this.count; i++) this.life[i * 4] = -1000; this.geometry.attributes.aLife.needsUpdate = true; this.credit = 0; this.cursor = 0; this.serial = 713; }
  get alive() { let n = 0; const t = this.uniforms.uTime.value; for (let i = 0; i < this.count; i++) if (t >= this.life[i*4] && t < this.life[i*4] + this.life[i*4+1]) n++; return n; }
}
