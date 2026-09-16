import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createSeabed } from './scene/Seabed.js';
import { createROV } from './rov/ROV.js';
import { Motion } from './rov/Motion.js';
import { CameraRig } from './camera/CameraRig.js';
import { Pipeline } from './render/Pipeline.js';
import { createParticles } from './render/Particles.js';
import { HUD } from './ui/HUD.js';
import { CockpitHUD } from './ui/CockpitHUD.js';
import { installShowcase } from './debug/Showcase.js';
import { GameState } from './core/GameState.js';
import { SequenceDirector } from './core/SequenceDirector.js';
import { qualityProfile } from './core/QualityProfile.js';
import { AudioBus } from './audio/AudioBus.js';
import { Sediment } from './render/Sediment.js';
import { Sonar } from './render/Sonar.js';
import { NoduleField } from './scene/NoduleField.js';
import { SamplingArm } from './rov/SamplingArm.js';
import { DigitalTwinStore, SaveRepository } from './twin/DigitalTwinStore.js';
import { LocalSimulation } from './twin/LocalSimulation.js';

document.title = 'ABYSS//MINER — 工业深海';
document.body.className = 'miner';
document.body.replaceChildren();
const canvas = document.createElement('canvas'); canvas.id = 'gl'; canvas.setAttribute('aria-label', '深海工业 ROV。W S 移动，A D 转向，Q E 升降。'); document.body.appendChild(canvas);

class MinerApp {
  constructor() {
    this.running = false; this.time = 0; this.frame = 0; this.keys = new Set(); this.lastTimestamp = null;
    this.samples = []; this.stats = { median: 0, p95: 0, calls: 0, triangles: 0 };
    const params = this.params = new URLSearchParams(location.search);
    this.quality = qualityProfile(params.get('quality'));
    this.state = new GameState(); this.audio = new AudioBus();
    this.repository = new SaveRepository(); this.savedCareer=this.repository.load(); this.audio.muted=!!this.savedCareer.settings.audioMuted;
    this.twin = new DigitalTwinStore({ save: this.savedCareer, demo: params.get('scenario') === 'dashboard-demo' });
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
    this.seabed = createSeabed(this.scene); this.rov = createROV(this.scene,this.quality); this.originalVehicleColor = this.rov.materials.yellow.color.getHex();
    this.motion = new Motion(this.rov, this.seabed.heightAt); this.startY = this.rov.root.position.y;
    this.rig = new CameraRig(this.camera, canvas, this.rov, this.seabed.heightAt,this.seabed.obstacles);
    this.pipeline = new Pipeline(renderer, this.scene, this.camera, this.rov.lights,this.quality);
    this.particles = createParticles(this.scene, this.pipeline.lightUniforms,this.quality.snow);
    this.classicUI = params.get('ui') === 'classic';
    this.hud = this.classicUI ? new HUD() : new CockpitHUD(this, canvas, this.twin);
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
      this.twin.dispatch('sonar.ping',{snapshot});
    };
    this.director.register('sonar',{enter:()=>this.hud.showMessage('空格 · 主动声纳'),update:()=>{},exit:()=>{}});
    this.director.register('nodules',{enter:({reset})=>{if(reset){this.field.place();this.state.dispatch('poiDiscovered');}this.hud.showMessage('多金属结核矿区 · 空格分析');},update:()=>{},exit:()=>{}});
    this.director.register('sampling',{enter:({reset})=>{if(reset){this.field.place(5.5);this.state.dispatch('poiDiscovered');this.state.dispatch('fieldScanned');this.state.dispatch('targetSelected',{target:this.field.candidates[0]});this.hud.showAnalysis(this.field.candidates[0]);}this.hud.showMessage('目标锁定 · 左键开始采样');},update:()=>{},exit:()=>{}});
    this.startSampling=target=>{if(!this.arm.reachable(target)){this.audio.reject();this.hud.showMessage('超出机械臂范围 · 靠近/降低');return false;}this.director.goto('sampling',{reset:false});return this.arm.start(target);};
    this.simulation = new LocalSimulation(this, this.twin, this.repository);
    this.onSample=()=>{if(this.state.sample){this.twin.dispatch('sample.acquired',{sample:this.state.sample});this.simulation.persist();}};
    if(params.get('scenario')==='dashboard-demo'){this.state.dispatch('poiDiscovered');this.state.dispatch('fieldScanned');}
    installShowcase(this); this.resize();
    if(!this.classicUI&&this.hud.viewport&&globalThis.ResizeObserver){this.viewportObserver=new ResizeObserver(()=>this.resize());this.viewportObserver.observe(this.hud.viewport);}
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.running = false; this.showError('图形上下文丢失，请重新加载页面恢复场景。'); });
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
  applyVehicleSkin(id) {
    const color=id==='C01'?0xcf6d2e:this.originalVehicleColor;
    this.rov.materials.yellow.color.setHex(color);
    this.rov.materials.yellow.needsUpdate=true;
  }
  switchVehicle(id) {
    const before=this.twin.getSnapshot().vehicle.activeId;this.twin.dispatch('vehicle.switch',{id});
    const active=this.twin.getSnapshot().vehicle.activeId;if(active===before&&active!==id){this.hud.showMessage('C-01 尚未解锁 · 先完成结核采样');this.audio.reject();return false;}
    this.applyVehicleSkin(active);this.hud.showMessage(`控制权已切换至 ${this.twin.getSnapshot().vehicle.profiles[active].name}`);this.audio.confirm();return true;
  }
  setControlMode(mode) {
    if(this.twin.getSnapshot().vehicle.emergency)return false;
    this.twin.dispatch('control.mode',{mode});
    if(mode==='hold'){this.motion.velocity.set(0,0,0);this.motion.localVelocity.set(0,0,0);this.motion.yawVelocity=0;this.keys.clear();}
    return true;
  }
  setWaypoint(x,z){this.waypoint=new THREE.Vector3(x,this.seabed.heightAt(x,z)+4,z);this.twin.dispatch('navigation.waypoint',{x,z});this.hud.showMessage('航点已设置 · 选择 AUTO 开始导航');}
  setViewMode(mode) {
    this.twin.dispatch('ui.view',{mode});this.viewInputLocked=['map','simulation'].includes(mode);
    if(mode==='model'){this.previousRigMode=this.rig.mode;this.rig.setMode('inspect');}
    else if(this.previousRigMode){this.rig.setMode(this.previousRigMode==='free'?'follow':this.previousRigMode);this.previousRigMode=null;}
  }
  toggleMining() {
    const s=this.twin.getSnapshot();this.twin.dispatch('mining.toggle',{active:!s.mining.active});
    const after=this.twin.getSnapshot();this.hud.showMessage(after.mining.active?'采集头与吸矿泵已启动':'采集系统已停止');
  }
  emergencyStop() {
    this.keys.clear();this.motion.velocity.set(0,0,0);this.motion.localVelocity.set(0,0,0);this.motion.yawVelocity=0;this.twin.dispatch('emergency.stop');this.audio.impact();this.hud.showMessage('EMERGENCY STOP · 所有执行系统冻结');
  }
  rearm() { this.twin.dispatch('emergency.rearm');this.hud.showMessage('执行系统已重新武装');this.audio.confirm(); }
  resetMission(keepCareer=true) { this.twin.dispatch('mission.reset',{keepCareer});this.simulation.resetSession();this.director.goto('arrival');this.applyVehicleSkin('A07');this.hud.showMessage('任务已重置 · 等待声呐扫描'); }
  clearSave() { this.repository.clear();this.resetMission(false);this.hud.showMessage('本地存档已清除'); }
  controlledKeys() {
    const s=this.twin.getSnapshot();
    if(s.vehicle.emergency||this.viewInputLocked||s.vehicle.controlMode==='hold')return new Set();
    if(s.vehicle.controlMode==='assist'){
      const assisted=new Set(this.keys),p=this.rov.root.position,altitude=p.y-this.seabed.heightAt(p.x,p.z);if(altitude<2.2)assisted.add('KeyE');return assisted;
    }
    if(s.vehicle.controlMode!=='auto')return this.keys;
    const p=this.rov.root.position,d=(this.waypoint||this.field.center).clone().sub(p),target=Math.atan2(d.x,d.z),delta=Math.atan2(Math.sin(target-this.motion.yaw),Math.cos(target-this.motion.yaw)),keys=new Set();
    if(d.length()<=7){this.setControlMode('hold');this.hud.showMessage('自动导航完成 · 位置保持');return keys;}
    if(delta>.035)keys.add('KeyA');else if(delta<-.035)keys.add('KeyD');if(Math.abs(delta)<.65)keys.add('KeyW');return keys;
  }
  showError(message) {
    const error = document.createElement('div'); error.style.cssText = 'position:fixed;inset:20%;color:#dfcf9a;z-index:50;font:16px monospace';
    error.textContent = message; document.body.appendChild(error);
  }
  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, CONFIG.maxDpr);
    const measured=this.hud?.getViewportRect?.();
    if(measured?.width>=32&&measured?.height>=32)this.lastViewportRect={width:measured.width,height:measured.height};
    const rect=this.lastViewportRect||{width:innerWidth,height:innerHeight};
    this.width = Math.max(1,Math.floor(rect.width * this.dpr)); this.height = Math.max(1,Math.floor(rect.height * this.dpr));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = rect.width / Math.max(1,rect.height); this.camera.updateProjectionMatrix();
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
        const emergency=this.twin.getSnapshot().vehicle.emergency;
        if(!this.arm.active)this.motion.update(dt, this.rig.mode === 'free' || this.state.inputLocked ? new Set() : this.controlledKeys(), this.time);
        if(!emergency)this.arm.update(dt);
        this.rig.update(dt, this.time, this.keys);
      }
      const p=this.rov.root.position,altitude=p.y-this.seabed.heightAt(p.x,p.z);
      this.sediment.update(this.frozen?0:dt,this.time,p,this.motion.verticalThrust,altitude);
      this.audio.update(this.arm.active?.12:this.motion.thrust,this.arm.active?1:0);
      this.sonar.update();
      if(this.state.discovered&&['arrival','sonar'].includes(this.director.id)&&p.distanceTo(this.field.center)<18)this.director.goto('nodules',{reset:false});
      this.field.update();
      this.simulation.update(this.frozen?0:dt);
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
