import * as THREE from 'three';
/** Geometry-only normal/depth buffer. Optical foreground depth clips the echo. */
export class Sonar {
  constructor(app){
    this.app=app;this.enabled=true;this.origin=new THREE.Vector3();this.last=-100;this.snapshot=null;this.delivered=false;
    this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true});this.target.depthTexture=new THREE.DepthTexture(1,1);
    this.material=new THREE.MeshNormalMaterial();
    app.seabed.group.traverse(o=>o.layers.enable(1));
    const u=app.pipeline.composite.uniforms;
    Object.assign(u,{uSonar:{value:this.target.texture},uSonarDepth:{value:this.target.depthTexture},uPingOrigin:{value:this.origin},uPingAge:{value:-1},uSonarTexel:{value:new THREE.Vector2()}});
    const m=app.pipeline.composite.material;
    m.fragmentShader=m.fragmentShader.replace('void main(){',`uniform sampler2D uSonar,uSonarDepth;uniform vec3 uPingOrigin;uniform float uPingAge;uniform vec2 uSonarTexel;
    void main(){`);
    m.fragmentShader=m.fragmentShader.replace('float vignette=',`
      if(uPingAge>=0.){
        float sd=texture2D(uSonarDepth,vUv).x,od=texture2D(uDepth,vUv).x;
        vec3 wp=worldAt(vUv,sd);float range=length(wp-uPingOrigin);float age=uPingAge-range/48.;
        vec3 n=texture2D(uSonar,vUv).rgb;
        float edge=length(n-texture2D(uSonar,vUv+vec2(uSonarTexel.x,0.)).rgb)+length(n-texture2D(uSonar,vUv+vec2(0.,uSonarTexel.y)).rgb);
        vec3 cell=abs(fract(wp*2.5)-.5);float dots=1.-smoothstep(.09,.16,min(max(cell.x,cell.z),max(cell.y,cell.z)));
        float wave=exp(-abs(age)*19.);float trail=step(0.,age)*pow(max(0.,1.-age/1.8),2.);
        float mask=step(sd,od+.000006)*(1.-step(.999999,sd));
        col+=vec3(.07,.67,.48)*mask*(wave*.85+trail*(.065+dots*.38+min(1.,edge*4.)))*exp(-range*.006);
      }
      float vignette=`);
    app.pipeline.sonar=this;
  }
  resize(w,h){const s=this.app.quality.sonarScale;this.target.setSize(Math.floor(w*s),Math.floor(h*s));this.app.pipeline.composite.uniforms.uSonarTexel.value.set(1/this.target.width,1/this.target.height);}
  ping(){
    const a=this.app;if(a.time-this.last<4||a.state.inputLocked||['descent','lost','sampling'].includes(a.director.id))return false;
    this.last=a.time;this.origin.copy(a.rov.root.position);this.delivered=false;a.state.dispatch('sonarPinged');
    const target=a.field?.center||new THREE.Vector3(0,a.seabed.heightAt(0,112),112),delta=target.clone().sub(this.origin);
    const bearing=(THREE.MathUtils.radToDeg(Math.atan2(delta.x,delta.z)-a.motion.yaw)%360+360)%360;
    this.snapshot={bearing,distance:delta.length()*205/112,size:'未解析',confidence:'低',classification:'未知接触',serial:a.state.pingCount,worldPos:target.clone()};
    if(a.state.pingCount===1)this.snapshot.distance=205;
    a.hud.showMessage('主动声纳 · 发射中');
    a.onPing?.(this.snapshot);a.audio.ping();return true;
  }
  update(){const a=this.app,age=a.time-this.last;
    a.pipeline.composite.uniforms.uPingAge.value=this.enabled&&age>=0&&age<5?age:-1;
    if(!this.delivered&&this.snapshot&&age>.65){this.delivered=true;a.state.dispatch('poiDiscovered');a.hud.showContact(this.snapshot);a.hud.showMessage('回波已收 · 空格重新扫描');}
  }
  render(){
    if(this.app.pipeline.composite.uniforms.uPingAge.value<0)return;
    const {renderer:r,scene:s,camera:c}=this.app,mask=c.layers.mask,bg=s.background,override=s.overrideMaterial,auto=r.shadowMap.autoUpdate;
    c.layers.set(1);s.overrideMaterial=this.material;s.background=new THREE.Color(0);r.shadowMap.autoUpdate=false;
    r.setRenderTarget(this.target);r.clear();r.render(s,c);
    c.layers.mask=mask;s.background=bg;s.overrideMaterial=override;r.shadowMap.autoUpdate=auto;
  }
  reset(){this.last=-100;this.snapshot=null;this.delivered=false;this.app.pipeline.composite.uniforms.uPingAge.value=-1;}
}
