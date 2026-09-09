import * as THREE from 'three';
import { cellSeed } from '../../underwater/WorldNoise.js';
import { CONFIG } from '../config.js';

export function createParticles(scene, lightUniforms, count = CONFIG.particles) {
  const geometry = new THREE.BufferGeometry(), positions = new Float32Array(count * 3), seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < 3; j++) positions[i * 3 + j] = (cellSeed(i, j, 61) / 4294967295 - 0.5) * 32;
    seeds[i] = cellSeed(i, 4, 61) / 4294967295;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const uniforms = { ...lightUniforms, uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uHeight: { value: 1080 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime, uHeight; uniform vec3 uCenter;
      uniform vec3 uLampPos[2], uLampDir[2];
      attribute float aSeed; varying float vAlpha;
      void main() {
        float layer=floor(aSeed*3.);float span=layer<.5?18.:layer<1.5?36.:64.;
        vec3 p = position + vec3(uTime*.032, -uTime*(.03+layer*.014), sin(uTime*.13+aSeed*63.)*.24);
        p = mod(p-uCenter+span*.5,span)-span*.5+uCenter;
        float lighting = 0.;
        for(int i=0;i<2;i++) {
          vec3 delta=p-uLampPos[i]; float d=length(delta);
          lighting+=smoothstep(${Math.cos(CONFIG.lightAngle).toFixed(5)},${(Math.cos(CONFIG.lightAngle) * .35 + .65).toFixed(5)},dot(delta/max(d,.001),uLampDir[i]))*10./(1.+d*d*.09);
        }
        lighting+=.32*exp(-length(p-uCenter)*.22);
        vec4 mv = viewMatrix*vec4(p,1.);
        float d = length(mv.xyz);
        vAlpha=min(.65,lighting*.28)*smoothstep(.6,2.,d)*(1.-smoothstep(span*.35,span*.5,length(p-uCenter)))*exp(-d*.032);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((.018+aSeed*.032)*uHeight/max(1.,-mv.z),1.,5.5);
      }`,
    fragmentShader: `varying float vAlpha;
      void main(){ float r=length(gl_PointCoord-.5)*2.; if(r>1.)discard;
        gl_FragColor=vec4(.63,.77,.76,vAlpha*(1.-smoothstep(.15,1.,r))); }`,
  });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; scene.add(points);
  return { points, update(time, center, height) { uniforms.uTime.value = time; uniforms.uCenter.value.copy(center); uniforms.uHeight.value = height; } };
}
