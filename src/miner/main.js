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

document.title = 'ABYSS//MINER — Industrial Deep Sea';
document.body.className = 'miner';
document.body.replaceChildren();
const canvas = document.createElement('canvas'); canvas.id = 'gl'; canvas.setAttribute('aria-label', 'Industrial ROV in the deep sea. W S move, A D turn, Q E descend and ascend.'); document.body.appendChild(canvas);

class MinerApp {
  constructor() {
    this.running = false; this.time = 0; this.frame = 0; this.keys = new Set(); this.lastTimestamp = null;
    this.samples = []; this.stats = { median: 0, p95: 0, calls: 0, triangles: 0 };
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = CONFIG.exposure;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This M1 scene requires WebGL2 with floating-point render targets.');
    this.caps = { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), backend: 'WebGL2' };
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color().setRGB(.001,.004,.0045);
    this.scene.fog = new THREE.FogExp2(this.scene.background, 0.029);
    this.scene.add(new THREE.HemisphereLight(0x637b7c, 0x303533, 0.22));
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 110);
    this.seabed = createSeabed(this.scene); this.rov = createROV(this.scene);
    this.motion = new Motion(this.rov, this.seabed.heightAt); this.startY = this.rov.root.position.y;
    this.rig = new CameraRig(this.camera, canvas, this.rov, this.seabed.heightAt);
    this.pipeline = new Pipeline(renderer, this.scene, this.camera, this.rov.lights);
    this.particles = createParticles(this.scene, this.pipeline.lightUniforms); this.hud = new HUD();
    installShowcase(this); this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.running = false; this.showError('Graphics context lost. Reload to restore the scene.'); });
    const params = new URLSearchParams(location.search);
    this.setPose(params.get('pose') || 'hero');
    if (params.get('hud') === '0') this.hud.toggle();
    if (params.get('camera') === 'cinematic') this.rig.setMode('cinematic');
    if (params.get('perf') === '1') this.hud.togglePerf();
    this.frozen = params.get('still') === '1';
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
        this.motion.update(dt, this.rig.mode === 'free' ? new Set() : this.keys, this.time);
        this.rig.update(dt, this.time, this.keys);
      }
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
catch (error) { console.error(error); const message = document.createElement('p'); message.textContent = `ABYSS//MINER could not start: ${error.message}`; message.style.cssText='position:fixed;inset:20%;color:#dfcf9a;z-index:50'; document.body.appendChild(message); }
