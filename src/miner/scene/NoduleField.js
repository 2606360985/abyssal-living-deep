import * as THREE from 'three';
import { cellSeed } from '../../underwater/WorldNoise.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
export function sampleData(id,seed=713){
  const r=n=>cellSeed(id*17+n,seed,391)/4294967295;
  const Ni=Math.round((1.1+r(0)*1.6)*10)/10,Co=Math.round((.2+r(1)*.7)*10)/10,Cu=Math.round((.8+r(2)*1.6)*10)/10;
  return {id:`N-${String(id+1).padStart(3,'0')}`,mass:Math.round((1.2+r(3)*2.5)*100)/100,composition:{Ni,Co,Cu,Mn:Math.round((100-Ni-Co-Cu)*10)/10},value:Math.round(1800+r(4)*7400)};
}
/** Mineral percentages are normalized game assay values, not real bulk chemistry. */
export class NoduleField {
  constructor(app){
    this.app=app;this.center=new THREE.Vector3(0,app.seabed.heightAt(0,112),112);this.group=new THREE.Group();this.group.name='多金属结核矿区';app.scene.add(this.group);
    this.candidates=[];this.pointer=new THREE.Vector2(0,0);this.ray=new THREE.Raycaster();this.projected=new THREE.Vector3();this.matrix=new THREE.Object3D();this.hover=null;
    this.material=new THREE.MeshStandardMaterial({color:0x242b28,roughness:.73,metalness:.18});
    this.meshes=[];const r=i=>cellSeed(i,42,713)/4294967295;
    for(let type=0;type<3;type++){
      const source=new THREE.IcosahedronGeometry(1,1);source.deleteAttribute('normal');source.deleteAttribute('uv');const geo=mergeVertices(source);source.dispose();const p=geo.attributes.position;
      for(let i=0;i<p.count;i++){const s=.85+r(i+type*100)*.25;p.setXYZ(i,p.getX(i)*s,p.getY(i)*s*.65,p.getZ(i)*s);}geo.computeVertexNormals();
      const mesh=new THREE.InstancedMesh(geo,this.material,1000);mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);this.meshes.push(mesh);
      for(let i=0;i<1000;i++){
        const index=type*1000+i,angle=r(index*5)*Math.PI*2,rad=Math.sqrt(r(index*5+1))*23;
        const x=Math.cos(angle)*rad,z=112+Math.sin(angle)*rad,size=.055+r(index*5+2)**2*.16;
        this.matrix.position.set(x,app.seabed.heightAt(x,z)+size*.22,z);this.matrix.scale.setScalar(size);this.matrix.rotation.set(r(index*5+3)*.4,r(index*5+4)*6.28,0);this.matrix.updateMatrix();mesh.setMatrixAt(i,this.matrix.matrix);
      }
    }
    this.candidateMesh=new THREE.InstancedMesh(this.meshes[0].geometry,this.material,7);this.candidateMesh.castShadow=true;this.candidateMesh.receiveShadow=true;this.group.add(this.candidateMesh);
    for(let i=0;i<7;i++){
      const x=[-.55,.55,-1.2,1.35,-.6,.7,0][i],z=108+Math.floor(i/2)*2.4;
      const position=new THREE.Vector3(x,app.seabed.heightAt(x,z)+.13,z),e=.1;
      const normal=new THREE.Vector3(app.seabed.heightAt(x-e,z)-app.seabed.heightAt(x+e,z),2*e,app.seabed.heightAt(x,z-e)-app.seabed.heightAt(x,z+e)).normalize();
      this.matrix.position.copy(position);this.matrix.rotation.set(0,r(i)*6.28,0);this.matrix.scale.setScalar(.25);this.matrix.updateMatrix();this.candidateMesh.setMatrixAt(i,this.matrix.matrix);
      this.candidates.push({...sampleData(i),index:i,position,normal,matrix:this.matrix.matrix.clone(),removed:false});
    }
    this.group.traverse(o=>o.layers.enable(1));
    this._dragDist=0;
    app.renderer.domElement.addEventListener('pointermove',e=>{this.pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);this._dragDist+=Math.abs(e.movementX)+Math.abs(e.movementY);});
    app.renderer.domElement.addEventListener('pointerdown',()=>{this._dragDist=0;});
    app.renderer.domElement.addEventListener('pointerup',e=>{if(e.button===0&&app.rig.mode!=='free'&&this._dragDist<10)this.confirm();});
  }
  valid(target){
    const a=this.app;if(!target||target.removed||a.rov.root.position.distanceTo(target.position)>4)return false;
    this.projected.copy(target.position).project(a.camera);if(Math.abs(this.projected.x)>1||Math.abs(this.projected.y)>1||this.projected.z<0||this.projected.z>1)return false;
    const delta=target.position.clone().sub(a.camera.position);this.ray.set(a.camera.position,delta.clone().normalize());this.ray.far=delta.length()-.22;
    return this.ray.intersectObjects([a.seabed.ground,a.seabed.rocks,a.rov.root],true).length===0;
  }
  update(){
    const a=this.app;if(a.state.sample||a.state.inputLocked||!a.state.scanned||!['nodules','sampling'].includes(a.director.id)){a.hud.showCandidate(null);return;}
    let closest=null,best=Infinity;
    for(const c of this.candidates){if(!this.valid(c))continue;const screen=c.position.clone().project(a.camera),d=Math.hypot((screen.x-this.pointer.x)*innerWidth,(screen.y-this.pointer.y)*innerHeight)/2;if(d<best){closest=c;best=d;}}
    this.hover=best<65?closest:null;
    const chosen=a.state.selected&&this.valid(a.state.selected)?a.state.selected:closest;
    if(chosen){const p=chosen.position.clone().project(a.camera);a.hud.showCandidate({x:(p.x+1)/2,y:(1-p.y)/2},a.state.selected===chosen?'已锁定 · 左键采样':'候选样本 · 左键选定');}
    else a.hud.showCandidate(null);
  }
  confirm(){const a=this.app;if(a.state.inputLocked||a.state.sample)return;
    if(a.state.selected&&this.valid(a.state.selected)){a.startSampling?.(a.state.selected);return;}
    if(!this.hover||!this.valid(this.hover)){a.audio.reject();a.hud.showMessage('移至 4m 以内 · 瞄准样本');return;}
    a.state.dispatch('targetSelected',{target:this.hover});a.hud.showAnalysis(this.hover);a.hud.showMessage('目标确认 · 左键采样');a.audio.confirm();
  }
  hide(c){this.matrix.matrix.copy(c.matrix);this.matrix.matrix.scale(new THREE.Vector3(0,0,0));this.candidateMesh.setMatrixAt(c.index,this.matrix.matrix);this.candidateMesh.instanceMatrix.needsUpdate=true;c.removed=true;}
  reset(){for(const c of this.candidates){c.removed=false;this.candidateMesh.setMatrixAt(c.index,c.matrix);}this.candidateMesh.instanceMatrix.needsUpdate=true;this.hover=null;this.pointer.set(0,0);}
  place(distance=15){const a=this.app,z=112-distance;a.motion.reset();a.rov.root.position.set(0,a.seabed.heightAt(0,z)+(distance<8?1.5:3),z);a.rig.reset();}
}
