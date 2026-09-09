import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createSeabed } from './scene/Seabed.js';
import { createROV } from './rov/ROV.js';
import { Motion } from './rov/Motion.js';
import { CameraRig } from './camera/CameraRig.js';
import { Pipeline } from './render/Pipeline.js';
import { createParticles } from './render/Particles.js';
import { HUD } from './ui/HUD.js';
import { installShowcase } from './debug/Showcase.js';
import { GameState } from './core/GameState.js';
import { SequenceDirector } from './core/SequenceDirector.js';
import { qualityProfile } from './core/QualityProfile.js';
import { AudioBus } from './audio/AudioBus.js';
import { Sediment } from './render/Sediment.js';
import { Sonar } from './render/Sonar.js';
import { NoduleField } from './scene/NoduleField.js';
import { SamplingArm } from './rov/SamplingArm.js';

document.title = 'ABYSS//MINER — 工业深海';
document.body.className = 'miner';
document.body.replaceChildren();
const canvas = document.createElement('canvas'); canvas.id = 'gl'; canvas.setAttribute('aria-label', '深海工业 ROV。W S 移动，A D 转向，Q E 升降。'); document.body.appendChild(canvas);

class MinerApp {
  constructor() {
    this.running = false; this.time = 0; this.frame = 0; this.keys = new Set(); this.lastTimestamp = null;
    this.samples = []; this.stats = { median: 0, p95: 0, calls: 0, triangles: 0 };
    this.quality = qualityProfile(new URLSearchParams(location.search).get('quality'));
    this.state = new GameState(); this.audio = new AudioBus();
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = CONFIG.exposure;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('此场景需要支持浮点渲染目标的 WebGL2。');
    this.caps = { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), backend: 'WebGL2' };
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color().setRGB(.001,.004,.0045);
    this.scene.fog = new THREE.FogExp2(this.scene.background, 0.029);
    this.scene.add(new THREE.HemisphereLight(0x637b7c, 0x303533, 0.22));
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 110);
    this.seabed = createSeabed(this.scene); this.rov = createROV(this.scene,this.quality);
    this.motion = new Motion(this.rov, this.seabed.heightAt); this.startY = this.rov.root.position.y;
    this.rig = new CameraRig(this.camera, canvas, this.rov, this.seabed.heightAt,this.seabed.obstacles);
    this.pipeline = new Pipeline(renderer, this.scene, this.camera, this.rov.lights,this.quality);
    this.particles = createParticles(this.scene, this.pipeline.lightUniforms,this.quality.snow); this.hud = new HUD();
    this.sediment = new Sediment(this.pipeline,this.seabed.heightAt,this.quality.sediment);
    this.director = new SequenceDirector(this);
    this.director.register('arrival',{enter:()=>{},update:()=>{},exit:()=>{}});
    this.sonar=new Sonar(this);
    this.field=new NoduleField(this);
    this.arm=new SamplingArm(this);
    this.ping=()=>this.sonar.ping();
    this.onPing=snapshot=>{
      if(this.director.id==='arrival')this.director.goto('sonar',{reset:false});
      if(this.rov.root.position.distanceTo(this.field.center)<20){snapshot.classification='多金属结核矿区';snapshot.size='46 米';snapshot.confidence='高';this.state.dispatch('fieldScanned');this.hud.showAnalysis(this.field.candidates[0]);}
    };
    this.director.register('sonar',{enter:()=>this.hud.showMessage('空格 · 主动声纳'),update:()=>{},exit:()=>{}});
    this.director.register('nodules',{enter:({reset})=>{if(reset){this.field.place();this.state.dispatch('poiDiscovered');}this.hud.showMessage('多金属结核矿区 · 空格分析');},update:()=>{},exit:()=>{}});
    this.director.register('sampling',{enter:({reset})=>{if(reset){this.field.place(5.5);this.state.dispatch('poiDiscovered');this.state.dispatch('fieldScanned');this.state.dispatch('targetSelected',{target:this.field.candidates[0]});this.hud.showAnalysis(this.field.candidates[0]);}this.hud.showMessage('目标锁定 · 左键开始采样');},update:()=>{},exit:()=>{}});
    this.startSampling=target=>{if(!this.arm.reachable(target)){this.audio.reject();this.hud.showMessage('超出机械臂范围 · 靠近/降低');return false;}this.director.goto('sampling',{reset:false});return this.arm.start(target);};
    installShowcase(this); this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.running = false; this.showError('图形上下文丢失，请重新加载页面恢复场景。'); });
    const params = new URLSearchParams(location.search);
    this.setPose(params.get('pose') || 'hero');
    this.director.goto('arrival',{reset:false});
    if (params.get('hud') === '0') this.hud.toggle();
    if (params.get('camera') === 'cinematic') this.rig.setMode('cinematic');
    if (params.get('perf') === '1') this.hud.togglePerf();
    this.frozen = params.get('still') === '1';
  }
  resetWorld() {
    this.state.dispatch('reset'); this.setPose('hero'); this.sediment.reset();this.sonar.reset();this.field.reset();this.arm.reset();
  }
  showError(message) {
    const error = document.createElement('div'); error.style.cssText = 'position:fixed;inset:20%;color:#dfcf9a;z-index:50;font:16px monospace';
    error.textContent = message; document.body.appendChild(error);
  }
  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, CONFIG.maxDpr);
    this.width = Math.floor(innerWidth * this.dpr); this.height = Math.floor(innerHeight * this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.pipeline.resize(this.width, this.height);
  }
  start() {
    this.running = true;
    this.renderer.setAnimationLoop(timestamp => {
      if (!this.running || document.hidden) { this.lastTimestamp = null; return; }
      const ms = this.lastTimestamp == null ? 16.667 : timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;
      const dt = Math.min(Math.max(ms / 1000, 0), 0.05);
      if (!this.frozen) {
        this.time += dt;
        this.director.update(dt);
        if(!this.arm.active)this.motion.update(dt, this.rig.mode === 'free' || this.state.inputLocked ? new Set() : this.keys, this.time);
        this.arm.update(dt);
        this.rig.update(dt, this.time, this.keys);
      }
      const p=this.rov.root.position,altitude=p.y-this.seabed.heightAt(p.x,p.z);
      this.sediment.update(this.frozen?0:dt,this.time,p,this.motion.verticalThrust,altitude);
      this.audio.update(this.arm.active?.12:this.motion.thrust,this.arm.active?1:0);
      this.sonar.update();
      if(this.state.discovered&&['arrival','sonar'].includes(this.director.id)&&p.distanceTo(this.field.center)<18)this.director.goto('nodules',{reset:false});
      this.field.update();
      this.pipeline.updateLights(); this.particles.update(this.time, this.rov.root.position, this.height);
      this.renderer.info.reset(); this.pipeline.render(this.time, this.seabed.heightAt(this.rov.root.position.x, this.rov.root.position.z));
      this.stats.calls = this.renderer.info.render.calls; this.stats.triangles = this.renderer.info.render.triangles;
      this.samples.push(ms); if (this.samples.length > 240) this.samples.shift();
      if (this.frame % 30 === 0) {
        const sorted = [...this.samples].sort((a,b) => a-b);
        this.stats.median = sorted[Math.floor(sorted.length / 2)] || 0;
        this.stats.p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      }
      this.hud.update(this, dt); this.frame++;
    });
  }
}

try { const app = new MinerApp(); window.__miner = app; app.start(); }
catch (error) { console.error(error); const message = document.createElement('p'); message.textContent = `ABYSS//MINER 无法启动：${error.message}`; message.style.cssText='position:fixed;inset:20%;color:#dfcf9a;z-index:50'; document.body.appendChild(message); }
