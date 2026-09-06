import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fieldNoise, cellSeed } from '../../underwater/WorldNoise.js';
import { CONFIG } from '../config.js';

/** Deterministic surface shared by geometry and vehicle clearance. */
export function floorHeight(x, z) {
  const n = (s, salt = 0) => fieldNoise(x * s, z * s, CONFIG.seed + salt) - 0.5;
  const channel = x - 5 - Math.sin(z * 0.035) * 6;
  return n(0.018) * 8 + n(0.065, 9) * 2.8 + n(0.22, 31) * 0.65
    - 3.8 * Math.exp(-channel * channel / 38) + 0.7;
}

function sedimentTexture() {
  const size = 256, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fine = cellSeed(x, y, 713) / 4294967295;
    const broad = fieldNoise(x * 0.065, y * 0.065, 68);
    const v = 100 + fine * 65 + broad * 45, i = (y * size + x) * 4;
    data[i] = v; data[i + 1] = v * 0.97; data[i + 2] = v * 0.88; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true; texture.repeat.set(100, 100);
  return texture;
}

export function createSeabed(scene) {
  const group = new THREE.Group(); group.name = 'abyssal terrain';
  const geometry = new THREE.PlaneGeometry(CONFIG.terrainSize, CONFIG.terrainSize, CONFIG.terrainSegments, CONFIG.terrainSegments);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position, colors = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, floorHeight(x, z));
    const shade = 0.32 + fieldNoise(x * 0.16, z * 0.16, 29) * 0.27;
    c.setRGB(shade, shade * 1.015, shade * 0.97); colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const map = sedimentTexture();
  const material = new THREE.MeshStandardMaterial({ color: 0x929590, vertexColors: true, roughness: 0.96, map, bumpMap: map, bumpScale: 0.07 });
  const ground = new THREE.Mesh(geometry, material); ground.receiveShadow = true; ground.castShadow = true; group.add(ground);
  const rockSource = new THREE.IcosahedronGeometry(1, 3);
  rockSource.deleteAttribute('normal'); rockSource.deleteAttribute('uv');
  const rockGeometry = mergeVertices(rockSource), rp = rockGeometry.attributes.position;
  rockSource.dispose();
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const d = 0.8 + fieldNoise(x * 3 + y, z * 3, 92) * 0.4;
    rp.setXYZ(i, x * d, y * d, z * d);
  }
  rockGeometry.computeVertexNormals();
  const uv = new Float32Array(rp.count * 2);
  for(let i=0;i<rp.count;i++){uv[i*2]=rp.getX(i)*.5+.5;uv[i*2+1]=rp.getZ(i)*.5+.5;}
  rockGeometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  const rockMap = map.clone(); rockMap.repeat.set(2,2);
  const rocks = new THREE.InstancedMesh(rockGeometry, new THREE.MeshStandardMaterial({ color: 0x646b68, roughness: 0.94, map: rockMap, bumpMap: rockMap, bumpScale: .09 }), 650);
  // Isotropic object-space mineral texture avoids stretched planar rock UVs.
  rocks.material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vStone;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStone=position;');
    shader.fragmentShader = `varying vec3 vStone;
      float stoneHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float stoneNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(stoneHash(i),stoneHash(i+vec3(1,0,0)),f.x),mix(stoneHash(i+vec3(0,1,0)),stoneHash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(stoneHash(i+vec3(0,0,1)),stoneHash(i+vec3(1,0,1)),f.x),mix(stoneHash(i+vec3(0,1,1)),stoneHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float stoneField(vec3 p){return stoneNoise(p*5.)*.55+stoneNoise(p*17.)*.3+stoneNoise(p*53.)*.15;}
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', 'float mineral=stoneField(vStone);diffuseColor.rgb*=.65+mineral*.8;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', 'normal=perturbNormalArb(-vViewPosition,normal,vec2(dFdx(mineral),dFdy(mineral))*.16,faceDirection);');
  };
  const matrix = new THREE.Object3D(), rand = i => cellSeed(i, 71, CONFIG.seed) / 4294967295;
  for (let i = 0; i < 650; i++) {
    const radius = 5 + rand(i * 7) ** 1.5 * 130, angle = rand(i * 7 + 1) * Math.PI * 2;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const scale = 0.12 + rand(i * 7 + 2) ** 3 * 1.7;
    matrix.position.set(x, floorHeight(x, z) + scale * 0.1, z);
    matrix.scale.set(scale * 1.4, scale * (0.4 + rand(i * 7 + 3)), scale);
    matrix.rotation.set(rand(i * 7 + 4), rand(i * 7 + 5) * 6.28, rand(i * 7 + 6) * 0.4);
    matrix.updateMatrix(); rocks.setMatrixAt(i, matrix.matrix);
    rocks.setColorAt(i, c.setScalar(0.65 + rand(i * 9) * 0.55));
  }
  rocks.castShadow = true; rocks.receiveShadow = true; group.add(rocks); scene.add(group);
  return { group, heightAt: floorHeight };
}
