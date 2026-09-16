/** Fixed poses let visual QA compare the same scene after each lighting change. */
export function installShowcase(app) {
  const { rig, motion } = app;
  app.setPose = (name = 'hero') => {
    motion.reset(); app.time = 0; rig.reset(); app.keys.clear();
    if (name === 'close') { rig.offset.set(3.5, 1.8, 4.3); rig.lookOffset.set(0, 0.15, 0); }
    if (name === 'low') { rig.offset.set(4.8, -1.5, -5); rig.lookOffset.set(0, -0.4, 2.5); }
    rig.update(0, 0, app.keys, true);
  };
  const codes = new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyZ','KeyX','KeyM','KeyT','KeyH','Space','ShiftLeft','F1','F2','F3','F4',...Array.from({length:7},(_,i)=>`Digit${i+1}`)]);
  window.addEventListener('pointerdown',()=>app.audio.unlock());
  window.addEventListener('keydown', e => {
    if (!codes.has(e.code)) return;
    e.preventDefault(); app.keys.add(e.code);
    if (e.repeat) return;
    app.audio.unlock();
    if(e.code==='KeyM')app.audio.setMuted(!app.audio.muted);
    if(e.code==='KeyT')app.toggleMining?.();
    if(e.code==='KeyH')app.setControlMode?.(app.twin?.getSnapshot().vehicle.controlMode==='hold'?'manual':'hold');
    if (e.code === 'F1') app.hud.toggle();
    if (e.code === 'F2') app.hud.togglePerf();
    if (e.code === 'F3') rig.setMode(rig.mode === 'free' ? 'follow' : 'free');
    if (e.code === 'F4') rig.setMode(rig.mode === 'cinematic' ? 'follow' : 'cinematic');
    if (e.code.startsWith('Digit')) app.director.goto(Number(e.code.slice(5)));
    if(e.code==='Space')app.ping?.();
  });
  window.addEventListener('keyup', e => app.keys.delete(e.code));
  window.addEventListener('blur', () => app.keys.clear());
  document.addEventListener('visibilitychange', () => { app.keys.clear(); app.lastTimestamp = null;if(document.hidden)app.audio.suspend();else if(app.audio.ctx)app.audio.unlock(); });
}
