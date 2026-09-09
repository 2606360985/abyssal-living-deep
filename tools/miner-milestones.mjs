import assert from 'node:assert/strict';
export async function milestoneChecks(page, level, shot, checks) {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  if(level===2){
    const rates=await page.evaluate(()=>{
      const a=window.__miner,p=a.rov.root.position,r=[];
      for(const altitude of [2,4,8]){a.sediment.reset();a.sediment.update(1,a.time,p,1,altitude);r.push(a.sediment.emissionRate);}
      a.sediment.reset();return r;
    });
    assert.ok(rates[0]>rates[1]&&rates[1]>0&&rates[2]===0);checks.push('Sediment emission attenuates at 2/4/8m');
    await page.evaluate(()=>{const a=window.__miner;a.setPose('low');a.rov.root.position.y=a.seabed.heightAt(0,0)+2;a.sediment.emit(a.rov.root.position,a.time,1,120);a.rig.update(0,0,a.keys,true);});
    await wait(800);await shot('sediment');
    for(const key of ['KeyW','KeyS','KeyA','KeyE']){
      await page.keyboard.down(key);await wait(10000);await page.keyboard.up(key);await shot(`motion-${key}`);
    }
    checks.push('Four continuous 10s forward/reverse/yaw/ascent segments rendered');
    await page.keyboard.press('Digit2');
  }
  if(level>=3){
    await page.keyboard.press('Digit3');await page.keyboard.down('Space');await wait(380);await shot('sonar-wave');await wait(650);await shot('sonar-echo');
    await wait(3300);assert.equal(await page.evaluate(()=>window.__miner.state.pingCount),1);await page.keyboard.up('Space');
    checks.push('Space held beyond cooldown produces one ping');
    const bearings=await page.evaluate(()=>{const a=window.__miner,r=[];for(const yaw of [0,Math.PI/2,-Math.PI/2]){a.sonar.reset();a.motion.yaw=yaw;a.sonar.ping();r.push(a.sonar.snapshot.bearing);}return r;});
    assert.deepEqual(bearings,[0,270,90]);checks.push('Relative bearings at 0/+90/-90 yaw');
    const locked=await page.evaluate(()=>{const a=window.__miner,b=a.sonar.snapshot.bearing;a.motion.yaw+=1;a.sonar.update();return b===a.sonar.snapshot.bearing;});assert.ok(locked);checks.push('Echo bearing locked at transmit time');
    await page.keyboard.press('Digit2');
  }
  if(level>=4){
    await page.keyboard.press('Digit4');await wait(400);await shot('field-approach');await page.keyboard.press('Space');await wait(900);await shot('field-assay');
    const data=await page.evaluate(()=>window.__miner.field.candidates.map(c=>({id:c.id,mass:c.mass,composition:c.composition,value:c.value})));for(const c of data)assert.ok(Math.abs(Object.values(c.composition).reduce((x,y)=>x+y,0)-100)<.001);
    await page.keyboard.press('Digit4');assert.deepEqual(await page.evaluate(()=>window.__miner.field.candidates.map(c=>({id:c.id,mass:c.mass,composition:c.composition,value:c.value}))),data);checks.push('Seven deterministic assays sum to 100%');
    await page.evaluate(()=>{const a=window.__miner;a.field.place(5.5);a.state.dispatch('fieldScanned');});await wait(700);await shot('field-close');
    const valid=await page.evaluate(()=>window.__miner.field.candidates.map(c=>window.__miner.field.valid(c)));assert.ok(valid.some(Boolean),'At least one unobstructed close sample');checks.push('Close candidates visible and within 4m');
    await page.evaluate(()=>window.__miner.field.place(30));assert.ok((await page.evaluate(()=>window.__miner.field.candidates.map(c=>window.__miner.field.valid(c)))).every(v=>!v));checks.push('Distant samples cannot be locked');
    await page.keyboard.press('Digit2');
  }
  if(level>=5){
    for(let i=0;i<3;i++){
      await page.keyboard.press('Digit5');
      const started=await page.evaluate(i=>{const a=window.__miner,c=a.field.candidates[i];a.rov.root.position.set(c.position.x+.55,a.seabed.heightAt(c.position.x+.55,c.position.z-1.5)+1.5,c.position.z-1.5);a.rig.offset.set(3.4,1.6,3.8);a.rig.lookOffset.set(0,-.4,.9);a.rig.update(0,0,a.keys,true);return a.startSampling(c);},i);assert.ok(started,`IK candidate ${i}`);
      await wait(2200);await shot(`arm-${i}-extend`);await wait(1800);assert.ok(await page.evaluate(()=>window.__miner.arm.sampleMesh.visible));await shot(`arm-${i}-grasp`);
      await wait(2900);assert.equal(await page.evaluate(()=>window.__miner.state.sample?.index),i);assert.equal(await page.evaluate(()=>window.__miner.arm.sampleMesh.visible),false);await shot(`arm-${i}-acquired`);
    }
    checks.push('Three reachable targets: extend / attach / stow / sample acquired');
    await page.keyboard.press('Digit5');await page.evaluate(()=>window.__miner.startSampling(window.__miner.field.candidates[0]));await wait(3800);await page.keyboard.press('Digit2');assert.ok(await page.evaluate(()=>{const a=window.__miner;return !a.arm.active&&!a.arm.sampleMesh.visible&&!a.state.inputLocked&&a.field.candidates.every(c=>!c.removed);}));checks.push('Mid-grasp stage reset restores original instance and unlocks controls');
  }
}
