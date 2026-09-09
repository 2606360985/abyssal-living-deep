import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG } from '../config.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function paintTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#cfa827'; ctx.fillRect(0, 0, 256, 256);
  let seed = 1729;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(45,35,18,${random() * 0.16})`;
    ctx.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1);
  }
  for (let i = 0; i < 70; i++) { ctx.fillStyle = '#817349'; ctx.fillRect(random() * 256, random() * 256, random() * 9, 0.7); }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
}

export function createROV(scene, quality = { shadowSize: CONFIG.shadowSize }) {
  const root = new THREE.Group(); root.name = 'ROV / A-07'; scene.add(root);
  const yellow = new THREE.MeshStandardMaterial({ map: paintTexture(), roughness: 0.64, metalness: 0.08 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303b3c, roughness: 0.48, metalness: 0.45 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x82918c, roughness: 0.4, metalness: 0.58 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x11191b, roughness: 0.8 });
  const orange = new THREE.MeshStandardMaterial({ color: 0x98411a, roughness: .65, metalness: .15 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x09232a, metalness: 0.7, roughness: 0.12 });
  const white = new THREE.MeshStandardMaterial({ color: 0xbdd4d5, emissive: 0xb5e7ef, emissiveIntensity: 4 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffad34, emissive: 0xff7c10, emissiveIntensity: 2.2 });
  function mesh(geometry, material, position, parent = root) {
    const obj = new THREE.Mesh(geometry, material); obj.position.copy(position);
    obj.castShadow = true; obj.receiveShadow = true; parent.add(obj); return obj;
  }
  function box(w, h, d, position, material = dark, radius = 0.025, parent = root) {
    return mesh(new RoundedBoxGeometry(w, h, d, 2, radius), material, position, parent);
  }
  function rod(a, b, radius = 0.035, material = steel, parent = root) {
    const delta = b.clone().sub(a);
    const obj = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 10), material, a.clone().add(b).multiplyScalar(0.5), parent);
    obj.quaternion.setFromUnitVectors(V(0, 1, 0), delta.normalize()); return obj;
  }
  function tube(points, radius = 0.023, material = rubber) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 36, radius, 7, false), material, V(0, 0, 0));
  }
  // Foam blocks above an open cage, with load-bearing rails and separate skids.
  for (const side of [-1, 1]) {
    box(0.61, 0.48, 2.18, V(side * 0.58, 0.7, 0), yellow, 0.085);
    for (const z of [-0.65, 0.62]) box(0.045, 0.495, 0.09, V(side * 0.91, 0.7, z), dark);
    for(const z of [-.65,.62])box(.59,.016,.068,V(side*.58,.944,z),dark,.006);
    for(const z of [-.22,.2])rod(V(side*.58,.94,z),V(side*.58,1.015,z),.022,dark);
    rod(V(side*.58,1.015,-.22),V(side*.58,1.015,.2),.022,dark);
    for (const y of [-0.58, 0.38]) rod(V(side * 0.92, y, -1.16), V(side * 0.92, y, 1.16), 0.044);
    for (const z of [-1.02, 0.94]) {
      rod(V(side * 0.92, -0.58, z), V(side * 0.92, 0.49, z), 0.046);
      rod(V(-0.92, -0.58, z), V(0.92, -0.58, z), 0.04);
    }
    rod(V(side * 0.94, -0.72, -1.25), V(side * 0.94, -0.72, 1.32), 0.065, dark);
    rod(V(side * 0.92, -0.58, -1), V(side * 0.92, 0.35, -0.3), 0.026, dark);
    tube([V(side * 0.45, 0.4, -0.6), V(side * 0.77, 0.21, -0.9), V(side * 0.75, -0.27, 0), V(side * 0.7, 0.12, 0.94)]);
    tube([V(side * 0.32, 0.4, -0.7), V(side * 0.42, 0.5, -0.95), V(side * 0.7, 0.34, -1.15)], 0.017, yellow);
    for (const z of [-0.88, -0.52, 0.55, 0.88]) {
      const bolt = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.025, 6), steel, V(side * 0.906, 0.72, z)); bolt.rotation.z = Math.PI / 2;
    }
  }
  box(1.48, 0.09, 1.84, V(0, -0.49, 0));
  box(0.63, 0.46, 1.35, V(0, -0.11, -0.1), steel, 0.09);
  for (let i = 0; i < 9; i++) box(0.66, 0.026, 0.024, V(0, 0.05, -0.67 + i * 0.13), dark);
  // Pressure vessels, connector bulkheads, protective grilles and harnesses.
  for(const side of [-1,1]) {
    const vessel=mesh(new THREE.CylinderGeometry(.16,.16,1.2,20),dark,V(side*.48,-.16,-.15));vessel.rotation.x=Math.PI/2;
    for(const z of [-.75,.45]) {
      const cap=mesh(new THREE.SphereGeometry(.158,16,8),steel,V(side*.48,-.16,z));cap.scale.z=.4;
      for(let i=0;i<4;i++)rod(V(side*.48+Math.cos(i*1.57)*.11,-.16+Math.sin(i*1.57)*.11,z-.015),V(side*.48+Math.cos(i*1.57)*.11,-.16+Math.sin(i*1.57)*.11,z+.03),.018,dark);
    }
    for(const z of [-.5,.2]) {
      const band=mesh(new THREE.TorusGeometry(.167,.018,6,24),steel,V(side*.48,-.16,z));band.castShadow=false;
    }
    tube([V(side*.43,.06,-.5),V(side*.75,.22,-.83),V(side*.82,-.22,-.97),V(side*.5,-.34,-.75)],.025,orange);
    tube([V(side*.5,-.1,.46),V(side*.72,-.17,.73),V(side*.68,.18,.87),V(side*.4,.27,.6)],.017,rubber);
    for(let j=0;j<6;j++) rod(V(side*.73,-.44,-.6+j*.17),V(side*.88,.14,-.6+j*.17),.012,dark);
  }
  box(.8,.19,.32,V(0,-.33,-.91),yellow);
  for(let j=0;j<6;j++)box(.035,.19,.012,V(-.33+j*.13,-.33,-1.078),dark,.004);
  const rotors = [], blurDiscs = [];
  function thruster(position, axis) {
    const mount = new THREE.Group(); mount.position.copy(position); mount.quaternion.setFromUnitVectors(V(0, 0, 1), axis); root.add(mount);
    mesh(new THREE.TorusGeometry(0.225, 0.065, 10, 24), dark, V(0, 0, 0), mount);
    const ductMaterial=dark.clone();ductMaterial.side=THREE.DoubleSide;
    const duct=mesh(new THREE.CylinderGeometry(.225,.245,.32,24,1,true),ductMaterial,V(0,0,-.075),mount);duct.rotation.x=Math.PI/2;
    for (const z of [-0.235, 0.085]) mesh(new THREE.TorusGeometry(0.236, 0.023, 6, 24), steel, V(0, 0, z), mount);
    const motor=mesh(new THREE.CylinderGeometry(.078,.078,.2,12),dark,V(0,0,-.12),mount);motor.rotation.x=Math.PI/2;
    const rotor = new THREE.Group(); mount.add(rotor); rotors.push(rotor);
    const blur=mesh(new THREE.CircleGeometry(.2,24),new THREE.MeshBasicMaterial({color:0x879994,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}),V(0,0,.015),mount);blur.castShadow=false;blurDiscs.push(blur);
    for (let j = 0; j < 4; j++) {
      const blade = box(0.08, 0.18, 0.025, V(Math.sin(j * Math.PI / 2) * 0.095, Math.cos(j * Math.PI / 2) * 0.095, 0), steel, 0.01, rotor);
      blade.rotation.z = -j * Math.PI / 2; blade.rotation.y = 0.3;
    }
    mesh(new THREE.SphereGeometry(0.063, 12, 8), dark, V(0, 0, 0.02), rotor);
    rod(V(-0.23, 0, 0.085), V(0.23, 0, 0.085), 0.012, dark, mount);
    rod(V(0, -0.23, 0.085), V(0, 0.23, 0.085), 0.012, dark, mount);
  }
  for (const side of [-1, 1]) for (const z of [-0.78, 0.65]) thruster(V(side * 1.04, 0.02, z), V(side * 0.42, 0, z > 0 ? 0.91 : -0.91));
  for (const side of [-1, 1]) thruster(V(side * 0.39, 0.47, -0.7), V(0, 1, 0));
  // Folded hydraulic arm with a piston, joint and two fingers.
  const armStart=root.children.length;
  rod(V(-0.55, -0.34, 0.65), V(-0.72, -0.5, 1.21), 0.085, yellow);
  rod(V(-0.72, -0.5, 1.21), V(-0.37, -0.38, 1.44), 0.06, steel);
  rod(V(-0.52, -0.25, 0.73), V(-0.67, -0.39, 1.13), 0.035, steel);
  mesh(new THREE.SphereGeometry(0.11, 12, 8), dark, V(-0.72, -0.5, 1.21));
  for (const side of [-1, 1]) {
    rod(V(-0.37 + side * 0.075, -0.38, 1.44), V(-0.37 + side * 0.12, -0.42, 1.61), 0.027);
    rod(V(-0.37 + side * 0.12, -0.42, 1.61), V(-0.37 + side * 0.035, -0.42, 1.7), 0.022);
  }
  tube([V(-0.5, -0.2, 0.5), V(-0.82, -0.35, 0.98), V(-0.71, -0.38, 1.25), V(-0.37, -0.32, 1.43)], 0.018);
  const foldedArm=new THREE.Group();for(const child of root.children.slice(armStart))foldedArm.add(child);root.add(foldedArm);
  box(0.37, 0.24, 0.24, V(0.16, 0.15, 1.08), dark);
  const cameraLens = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.11, 24), lens, V(0.16, 0.15, 1.25)); cameraLens.rotation.x = Math.PI / 2;
  const lights = [];
  for (const side of [-1, 1]) {
    const position = V(side * 0.8, 0.43, 1.14);
    const housing = mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.3, 24), dark, position); housing.rotation.x = Math.PI / 2;
    const glass = mesh(new THREE.CircleGeometry(0.117, 24), white, position.clone().add(V(0, 0, 0.155))); glass.castShadow = false;
    const lamp = new THREE.SpotLight(0xd3e9e7, CONFIG.lightPower, CONFIG.lightRange, CONFIG.lightAngle, 0.55, 2);
    lamp.position.copy(position).add(V(0, 0, 0.2)); lamp.target.position.set(side * 4, -5.3, 24);
    lamp.castShadow = true; lamp.shadow.mapSize.setScalar(quality.shadowSize);
    lamp.shadow.camera.near = 0.12; lamp.shadow.camera.far = CONFIG.lightRange;
    lamp.shadow.bias = -0.00015; lamp.shadow.normalBias = 0.035;
    root.add(lamp, lamp.target); lights.push(lamp);
  }
  rod(V(0, 0.36, -0.35), V(0, 1.26, -0.35), 0.032, dark);
  const beacon = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 12), amber, V(0, 1.24, -0.35));
  const statusLight = new THREE.PointLight(0xffa544, 0.5, 2); statusLight.position.copy(beacon.position); root.add(statusLight);
  const worklight = new THREE.PointLight(0xd2e5e1, 7, 5, 2); worklight.position.set(0.15, 1.7, -0.5); root.add(worklight);
  rod(V(0, 1.1, -0.35), worklight.position, 0.018, steel);
  mesh(new THREE.SphereGeometry(0.033, 8, 6), white, worklight.position);
  for (const side of [-1, 1]) {
    const service = new THREE.PointLight(0xe0d4aa, 6, 5, 2); service.position.set(side * 1.45, 1.1, -0.6); root.add(service);
    rod(V(side * .87, .44, -.6), service.position, .019, dark);
    const cover = box(.13, .09, .1, service.position.clone().add(V(0,.06,0)), dark);
    cover.castShadow = false;
    mesh(new THREE.SphereGeometry(.025, 8, 6), white, service.position);
  }
  const bottomLamp = new THREE.SpotLight(0xb6c7be, 80, 19, 1.15, .95, 2);
  bottomLamp.position.set(0,-.65,0); bottomLamp.target.position.set(0,-7,1.5); root.add(bottomLamp,bottomLamp.target);
  const bottomBounce=new THREE.PointLight(0x94a49b,35,18,2);bottomBounce.position.set(0,-.85,0);root.add(bottomBounce);
  const underside = new THREE.PointLight(0x9caea6, 4, 4, 2); underside.position.set(0, -0.35, 0.9); root.add(underside);
  tube([V(0, 0.76, -0.87), V(0.2, 1.9, -1.1), V(0.6, 4, -1.6), V(1.5, 8, -3), V(2.5, 15, -5)], 0.035, rubber);
  tube([V(0, 0.76, -0.87), V(0.1, 1.4, -1), V(0.2, 1.9, -1.1)], 0.044, yellow);
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#c6a12e'; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#1b2728'; ctx.font = 'bold 58px monospace'; ctx.fillText('A—07', 22, 64);
  ctx.font = '18px monospace'; ctx.fillText('ABYSSAL / WORK CLASS', 24, 101);
  for (let i = 0; i < 5; i++) ctx.fillRect(375 + i * 22, 15, 10, 95);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const plateMaterial = new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0.1 });
  for (const side of [-1, 1]) {
    const plate = mesh(new THREE.PlaneGeometry(1.25, 0.31), plateMaterial, V(side * 0.889, 0.7, 0)); plate.rotation.y = side * Math.PI / 2;
  }
  const allLights=[];root.traverse(o=>{if(o.isLight){o.userData.baseIntensity=o.intensity;allLights.push(o);}});
  return { root, lights, rotors, blurDiscs, beacon, allLights,foldedArm,materials:{yellow,dark,steel,rubber} };
}
