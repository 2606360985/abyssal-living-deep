import * as THREE from 'three';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),up=V(0,1,0);
const phaseNames={aim:'瞄准',extend:'伸展',approach:'接近',close:'闭合',lift:'提升',retract:'收回',stow:'收纳'};
export function solveTwoBone(shoulder,target,l1=1.15,l2=1.1){
  const delta=target.clone().sub(shoulder),d=delta.length();if(d>l1+l2-.015||d<Math.abs(l1-l2)+.01)return null;
  const direction=delta.divideScalar(d),along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const bend=V(-.7,.8,0).addScaledVector(direction,-V(-.7,.8,0).dot(direction)).normalize();
  return shoulder.clone().addScaledVector(direction,along).addScaledVector(bend,height);
}
export class SamplingArm {
  constructor(app){
    this.app=app;app.rov.foldedArm.visible=false;this.group=new THREE.Group();this.group.name='hydraulic manipulator';app.rov.root.add(this.group);
    this.shoulder=V(-.55,-.34,.65);this.stowed=V(-.7,-.38,1.4);this.tip=this.stowed.clone();this.normal=V(0,1,0);this.elbow=V();this.active=false;this.phase='stow';
    const {yellow,steel,dark,rubber}=app.rov.materials;
    const cylinder=new THREE.CylinderGeometry(1,1,1,12),sphere=new THREE.SphereGeometry(.115,12,8);
    const mesh=(g,m)=>{const o=new THREE.Mesh(g,m);o.castShadow=o.receiveShadow=true;this.group.add(o);return o;};
    this.upper=mesh(cylinder,yellow);this.lower=mesh(cylinder,steel);this.piston=mesh(cylinder,dark);this.ram=mesh(cylinder,steel);
    this.joints=[mesh(sphere,dark),mesh(sphere,dark)];this.joints[0].position.copy(this.shoulder);
    this.wrist=new THREE.Group();this.group.add(this.wrist);
    const collar=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.16,16),dark);this.wrist.add(collar);
    this.fingers=[];for(const side of [-1,1]){const finger=new THREE.Mesh(new THREE.BoxGeometry(.045,.27,.09),steel);finger.castShadow=true;this.wrist.add(finger);this.fingers.push({finger,side});}
    this.hoses=[];for(let i=0;i<12;i++)this.hoses.push(mesh(cylinder,rubber));
    this.sampleMesh=new THREE.Mesh(app.field.candidateMesh.geometry,app.field.material);this.sampleMesh.scale.setScalar(.25);this.sampleMesh.position.set(0,-.25,0);this.sampleMesh.visible=false;this.wrist.add(this.sampleMesh);
    this.reset();
  }
  rod(mesh,a,b,radius){mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.set(radius,a.distanceTo(b),radius);mesh.quaternion.setFromUnitVectors(up,b.clone().sub(a).normalize());}
  targetLocal(c){this.app.rov.root.updateMatrixWorld(true);return this.app.rov.root.worldToLocal(c.position.clone()).addScaledVector(this.localNormal(c),.25);}
  localNormal(c){return c.normal.clone().applyQuaternion(this.app.rov.root.getWorldQuaternion(new THREE.Quaternion()).invert());}
  reachable(c){return !!solveTwoBone(this.shoulder,this.targetLocal(c));}
  start(c){
    const a=this.app;if(this.active||c.removed||!this.reachable(c)){a.audio.reject();a.hud.showMessage('超出机械臂范围 · 靠近/降低');return false;}
    this.target=c;this.destination=this.targetLocal(c);this.normal.copy(this.localNormal(c));this.elapsed=0;this.active=true;this.grabbed=false;this.phase='aim';a.motion.velocity.set(0,0,0);a.motion.localVelocity.set(0,0,0);a.motion.yawVelocity=0;a.keys.clear();a.state.dispatch('samplingStarted');a.hud.showMessage('机械臂 · 瞄准');return true;
  }
  update(dt){
    let opening=.12;
    if(this.active){
      this.elapsed+=dt;const t=this.elapsed,smooth=x=>THREE.MathUtils.smoothstep(x,0,1);
      const above=this.destination.clone().addScaledVector(this.normal,.38);
      if(t<.6){this.phase='aim';this.tip.copy(this.stowed);}
      else if(t<2.1){this.phase='extend';this.tip.lerpVectors(this.stowed,above,smooth((t-.6)/1.5));}
      else if(t<3){this.phase='approach';this.tip.lerpVectors(above,this.destination,smooth((t-2.1)/.9));}
      else if(t<3.6){this.phase='close';this.tip.copy(this.destination);opening=THREE.MathUtils.lerp(.12,.062,smooth((t-3)/.6));}
      else if(t<4.4){this.phase='lift';this.tip.lerpVectors(this.destination,above,smooth((t-3.6)/.8));opening=.062;}
      else if(t<6.1){this.phase='retract';this.tip.lerpVectors(above,this.stowed,smooth((t-4.4)/1.7));opening=.062;}
      else {this.phase='stow';this.tip.copy(this.stowed);opening=.062;}
      if(t>=3.55&&!this.grabbed){this.grabbed=true;this.app.field.hide(this.target);this.sampleMesh.visible=true;this.app.sediment.emit(this.target.position,this.app.time,.65,90);this.app.audio.impact();this.app.cameraKick=.015;}
      this.app.hud.showMessage(`机械臂 · ${phaseNames[this.phase]||this.phase}`);
      if(t>=6.6){this.active=false;this.sampleMesh.visible=false;this.app.state.dispatch('sampleAcquired',{sample:this.target});this.app.hud.showAnalysis(this.target,true);this.app.hud.showMessage('样本已获取 · 已存入压力容器');this.app.audio.confirm();this.app.state.selected=null;this.app.director.goto('nodules',{reset:false});this.app.onSample?.();}
    }
    const elbow=solveTwoBone(this.shoulder,this.tip);if(!elbow)return;this.elbow.copy(elbow);
    this.rod(this.upper,this.shoulder,elbow,.073);this.rod(this.lower,elbow,this.tip,.052);this.joints[1].position.copy(elbow);
    const a=this.shoulder.clone().add(V(0,.12,0)),b=elbow.clone().lerp(this.tip,.32),mid=a.clone().lerp(b,.58);
    this.rod(this.piston,a,mid,.045);this.rod(this.ram,mid,b,.023);
    this.wrist.position.copy(this.tip);this.wrist.quaternion.setFromUnitVectors(up,this.normal);
    for(const {finger,side} of this.fingers){finger.position.set(side*(opening+.05),-.18,0);finger.rotation.z=side*(opening-.062)*2;}
    const path=new THREE.CatmullRomCurve3([this.shoulder.clone().add(V(-.12,.08,0)),elbow.clone().add(V(-.13,.16,0)),this.tip.clone().add(V(-.1,.1,0))]);
    for(let i=0;i<this.hoses.length;i++)this.rod(this.hoses[i],path.getPoint(i/12),path.getPoint((i+1)/12),.019);
  }
  reset(){this.active=false;this.elapsed=0;this.grabbed=false;this.target=null;this.tip.copy(this.stowed);this.normal.set(0,1,0);this.sampleMesh.visible=false;this.phase='stow';this.update(0);}
}
