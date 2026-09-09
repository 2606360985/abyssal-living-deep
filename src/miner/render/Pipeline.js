import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CONFIG } from '../config.js';

const vertexShader = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const reconstruction = `
  vec3 worldAt(vec2 uv, float depth) {
    vec4 p=uInvProjection*vec4(uv*2.-1.,depth*2.-1.,1.);
    return (uCameraWorld*vec4(p.xyz/p.w,1.)).xyz;
  }
`;

/** Half-resolution depth-clipped in-scattering, HDR bloom, then one output transform. */
export class Pipeline {
  constructor(renderer, scene, camera, lights, quality) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.lights = lights;
    this.quality = quality || { scatterScale: .5, steps: 40, bloom: .19, shadowEvery: 1 }; this.frame = 0;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
    this.target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.scatter = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.sedimentTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.lightUniforms = { uLampPos: { value: [new THREE.Vector3(), new THREE.Vector3()] }, uLampDir: { value: [new THREE.Vector3(), new THREE.Vector3()] } };
    this.uniforms = {
      ...this.lightUniforms,
      uDepth: { value: this.target.depthTexture }, uInvProjection: { value: camera.projectionMatrixInverse }, uCameraWorld: { value: camera.matrixWorld },
      uCamera: { value: camera.position }, uFloor: { value: 0 }, uTime: { value: 0 },
      uCone: { value: Math.cos(CONFIG.lightAngle) }, uPower: { value: CONFIG.lightPower },
      uSteps: { value: this.quality.steps },
      uShadow0: { value: null }, uShadow1: { value: null }, uShadowMatrix: { value: lights.map(light => light.shadow.matrix) },
    };
    this.volumeMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms, depthTest: false, depthWrite: false, vertexShader,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uDepth; uniform mat4 uInvProjection, uCameraWorld;
        uniform vec3 uCamera, uLampPos[2], uLampDir[2];
        uniform float uFloor,uTime,uCone,uPower;uniform int uSteps;
        uniform sampler2D uShadow0,uShadow1;uniform mat4 uShadowMatrix[2];
        #include <packing>
        ${reconstruction}
        float visibility(vec3 p,int lamp) {
          vec4 q=uShadowMatrix[lamp]*vec4(p,1.);vec3 uv=q.xyz/q.w;
          if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return 1.;
          float depth=lamp==0?unpackRGBAToDepth(texture2D(uShadow0,uv.xy)):unpackRGBAToDepth(texture2D(uShadow1,uv.xy));
          return step(uv.z-.0002,depth);
        }
        void main(){
          vec3 end=worldAt(vUv,texture2D(uDepth,vUv).x);
          float rayLength=min(length(end-uCamera),65.); vec3 ray=normalize(end-uCamera);
          vec3 sum=vec3(0.);
          // Integrate only the ray/cone intersection. Uniform whole-ray sampling
          // misses narrow beams near the lamp, producing noisy, broken cones.
          for(int i=0;i<2;i++) {
            vec3 q=uCamera-uLampPos[i];
            float sphereB=dot(q,ray), sphereD=sphereB*sphereB-dot(q,q)+${(CONFIG.lightRange ** 2).toFixed(1)};
            if(sphereD<=0.)continue;
            float lo=max(0.,-sphereB-sqrt(sphereD)), hi=min(rayLength,-sphereB+sqrt(sphereD));
            if(hi<=lo)continue;
            float a=dot(ray,uLampDir[i]),b=dot(q,uLampDir[i]),k=uCone*uCone;
            float A=a*a-k,B=2.*(a*b-k*dot(q,ray)),C=b*b-k*dot(q,q);
            float D=B*B-4.*A*C;
            float t1=lo,t2=hi;
            if(D>0. && abs(A)>.00001){
              float r1=(-B-sqrt(D))/(2.*A),r2=(-B+sqrt(D))/(2.*A);
              t1=clamp(min(r1,r2),lo,hi);t2=clamp(max(r1,r2),lo,hi);
            } else if(abs(A)<=.00001 && abs(B)>.00001){t1=clamp(-C/B,lo,hi);t2=t1;}
            for(int segment=0;segment<3;segment++) {
              float start=segment==0?lo:segment==1?t1:t2;
              float finish=segment==0?t1:segment==1?t2:hi;
              vec3 mid=q+ray*((start+finish)*.5);
              if(finish-start<.001 || dot(normalize(mid),uLampDir[i])<uCone)continue;
              float stepSize=(finish-start)/float(uSteps);
              for(int s=0;s<${CONFIG.scatterSteps};s++) {
                if(s>=uSteps)break;
                float t=start+(float(s)+.5)*stepSize; vec3 p=uCamera+ray*t;
                vec3 delta=p-uLampPos[i];float d=length(delta);vec3 ld=delta/max(d,.001);
                float density=.022+exp(-max(0.,p.y-uFloor)*.55)*.021*(.9+.1*sin(p.x*.18+p.z*.12+uTime*.07));
                float cone=smoothstep(uCone,mix(uCone,1.,.65),dot(ld,uLampDir[i]));
                float falloff=pow(max(0.,1.-pow(d/${CONFIG.lightRange.toFixed(1)},4.)),2.)/(1.+d*d);
                float phase=.45+1.6*pow(max(0.,dot(ld,-ray)),5.);
                float scatter=cone*falloff*uPower*density*.095*phase*exp(-d*.035-t*.027);
                sum+=vec3(.66,.83,.8)*scatter*stepSize*visibility(p,i);
              }
            }
          }
          gl_FragColor=vec4(sum,rayLength);
        }`,
    });
    this.quad = new FullScreenQuad(this.volumeMaterial);
    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.composite = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: { uScene: { value: this.target.texture }, uSediment: { value: this.sedimentTarget.texture }, uScatter: { value: this.scatter.texture }, uDepth: { value: this.target.depthTexture },
        uInvProjection: { value: camera.projectionMatrixInverse }, uCameraWorld: { value: camera.matrixWorld }, uCamera: { value: camera.position }, uTexel: { value: new THREE.Vector2() } },
      vertexShader,
      fragmentShader: `varying vec2 vUv; uniform sampler2D uScene,uScatter,uDepth,uSediment;
        uniform mat4 uInvProjection,uCameraWorld;uniform vec3 uCamera;uniform vec2 uTexel;
        ${reconstruction}
        void main(){
          float d=min(length(worldAt(vUv,texture2D(uDepth,vUv).x)-uCamera),65.);
          vec3 fog=vec3(0.);float weights=0.;
          for(int x=0;x<2;x++)for(int y=0;y<2;y++){
            vec2 uv=vUv+(vec2(float(x),float(y))-.5)*uTexel;
            vec4 s=texture2D(uScatter,uv);float w=1./(1.+abs(s.a-d)*5.);
            fog+=s.rgb*w;weights+=w;
          }
          vec3 col=texture2D(uScene,vUv).rgb*exp(-vec3(.035,.025,.024)*d)+fog/max(weights,.0001);
          vec4 sediment=texture2D(uSediment,vUv);col=col*(1.-sediment.a)+sediment.rgb;
          float vignette=1.-.2*smoothstep(.25,.85,length((vUv-.5)*vec2(1.,.8)));
          gl_FragColor=vec4(col*vignette,1.);
        }`,
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), this.quality.bloom, 0.5, 0.95);
    this.composer.addPass(this.composite); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.composer.addPass(new SMAAPass(1, 1));
    this._targetPosition = new THREE.Vector3();
  }
  resize(width, height) {
    this.target.setSize(width, height);
    const w = Math.max(1, Math.floor(width * this.quality.scatterScale)), h = Math.max(1, Math.floor(height * this.quality.scatterScale));
    this.scatter.setSize(w, h); this.composite.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.sedimentTarget.setSize(w,h);
    if(this.sediment)this.sediment.uniforms.uResolution.value.set(w,h);
    this.composer.setSize(width, height);
    this.sonar?.resize(width,height);
  }
  updateLights() {
    this.scene.updateMatrixWorld(true);
    this.lights.forEach((lamp, i) => {
      lamp.getWorldPosition(this.lightUniforms.uLampPos.value[i]); lamp.target.getWorldPosition(this._targetPosition);
      this.lightUniforms.uLampDir.value[i].copy(this._targetPosition).sub(this.lightUniforms.uLampPos.value[i]).normalize();
    });
  }
  render(time, floor) {
    const r = this.renderer;
    this.camera.updateMatrixWorld(); this.uniforms.uTime.value = time; this.uniforms.uFloor.value = floor;
    r.shadowMap.autoUpdate = this.frame++ % this.quality.shadowEvery === 0;
    r.setRenderTarget(this.target); r.clear(); r.render(this.scene, this.camera);
    this.uniforms.uShadow0.value = this.lights[0].shadow.map.texture;
    this.uniforms.uShadow1.value = this.lights[1].shadow.map.texture;
    this.sonar?.render();
    r.setRenderTarget(this.scatter); r.clear(); this.quad.render(r);
    r.setRenderTarget(this.sedimentTarget);r.setClearColor(0x000000,0);r.clear();
    if(this.sediment)r.render(this.sediment.scene,this.camera);
    r.setClearColor(0x000000,1);
    r.setRenderTarget(null); this.composer.render();
  }
}
