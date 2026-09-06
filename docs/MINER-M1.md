# ABYSS//MINER — M1 visual foundation

## Delivered behavior

The default entry is an independent WebGL2 scene. The retained ocean can be reached at `/?experience=legacy&site=deep`. It is not part of the miner render loop. No network art assets, UI framework or physics engine were added.

The ROV uses a roughly 2.5 m frame, twin painted flotation blocks, six ducted thrusters with rotating propellers, pressure vessels, connector harnesses, protective grilles, folded hydraulic manipulator, camera, searchlights and an upward-disappearing tether. Geometry and paint are generated in code. Its origin starts 4 m above the local seabed; the depth readout uses a 3,800 m mission datum.

The 320 m seabed is deterministic, with a sinuous trench, multiple noise scales and 650 instanced rocks. The same height function supplies navigation clearance. The two searchlights illuminate surfaces and cast shadows. A half-resolution scattering pass reconstructs camera rays from depth, intersects each light cone analytically, and integrates only the valid intervals. Lamp shadow maps suppress in-scattering behind terrain/rocks. The full-resolution composite uses depth-aware upsampling, followed by restrained bloom, one ACES/sRGB output transform and SMAA.

6,000 GPU-animated particles are bounded around the ROV, fade before wrapping and respond to lamp direction and distance. The near-floor scattering layer is an artistic approximation using the local floor height, not a simulated sediment volume. Service lamps and downward fill keep the machinery and immediate seabed legible without a globally bright ocean.

## Interfaces and ownership

- `scene/Seabed.js`: `createSeabed(scene)` returns `group` and `heightAt(x,z)`.
- `rov/ROV.js`: `createROV(scene)` returns `root`, the two `lights`, `rotors` and `beacon`. +Z is forward; geometry uses metres.
- `rov/Motion.js`: owns velocity, yaw and minimum clearance. No rigid-body or rock collision solver.
- `camera/CameraRig.js`: follow, free and cinematic modes. The camera has its own floor constraint.
- `render/Pipeline.js`: HDR target, depth texture, scattering, bloom, output and SMAA; resize owns render-target sizes.
- `debug/Showcase.js`: stage 2 reset and fixed hero/close/low camera poses.
- `window.__miner`: development inspection only; `setPose('hero'|'close'|'low')` resets position, time, input and camera.
- `config.js`: art/performance constants. DPR is capped at 1; the renderer does not silently reduce resolution to meet a frame target.

## Visual iterations performed

1. Captured the original midnight habitat, first in the existing software-rendered harness, then again on RTX 2060 at 1080p. Only the latter is a hardware visual baseline.
2. Fixed a render-target uniform cloning issue revealed by an actual black screenshot and console warnings.
3. Corrected the hero camera's handedness; added local side illumination so the industrial yellow is visible on the actual side panels.
4. Replaced whole-ray jittered light sampling with analytic cone intervals, removing coarse near-lamp noise.
5. Rebuilt thrusters as ducts, added pressure hardware and top straps, softened painted-material reflections, and welded rock normals to remove unintended faceting.
6. Added isotropic procedural rock variation, wider near-floor light, lamp-shadow occlusion and SMAA.
7. Repositioned the low recording camera after a real screenshot revealed foreground rock obstruction.

These decisions were made from browser captures, not from successful builds alone.

## Acceptance record — 2026-09-06

Hardware: NVIDIA GeForce RTX 2060 via ANGLE / Direct3D11, hardware-accelerated headless Chromium. Native 1920 × 1080, DPR 1, no adaptive downscale. The scattering target is 960 × 540 as designed; scene, composite and output remain 1080p.

| Measurement | Result |
| --- | --- |
| Sample duration | 60 seconds after warmup |
| Captured frame intervals | 3,597 |
| Median | 16.7 ms |
| P95 | 16.8 ms |
| Maximum | 17.3 ms |
| Draw calls, final sampled frame including passes | 233 |
| Submitted triangles including shadow passes | 1,054,323 |
| Browser errors / warnings | 0 / 0 |
| Legacy runtime modules loaded by miner | 0 |

The native-resolution 60 fps target was met in this run. This is not a performance claim for other hardware or browsers. `npm test` passed all original simulation suites; `npm run build` passed. Browser checks passed for HUD/performance toggles, free-camera separation and return, cinematic toggle, forward motion, blur input release, minimum seabed clearance, stage reset and viewport resize. Actual hero/close/low/HUD screenshots were inspected, and the scene was also opened in the Codex in-app browser.

The production bundle was additionally exercised through `vite preview` at port 4173. All miner interaction checks plus vertical ascent passed with no console warnings/errors. Forward travel and turning screenshots were inspected (`m1-production-travel.png`, `m1-production-turn.png`). Foreground rocks can partially obscure the vehicle while freely driving; collision-aware camera avoidance remains outside M1. The production legacy entry was also booted and captured successfully; its original shaders emit two D3D gradient-in-loop warnings. Those warnings do not occur in the miner scene.

Raw evidence: `tools/shots/m1-final-report.json` and `tools/shots/m1-final-{hero,close,low,hud,resize}.png`. The preserved hardware baseline is `tools/shots/baseline-gpu-legacy.png`. These files are local generated artifacts, not checked-in image assets.

## Reproduce verification

Run the Vite server, then `npm run qa:miner`. The script saves HUD, hero, close, low and resized captures, collects browser warnings/errors, verifies input/camera/reset/resize behavior, checks that legacy runtime modules were not fetched, and measures 60 seconds after warmup. It records hardware and framebuffer dimensions alongside percentiles. A short forward-driving segment is included in the measured run. Headless Chromium is hardware accelerated via D3D11; these are browser RAF frame times, not isolated GPU timer-query durations.

Visual comparisons use seed 713 and the same camera presets. `?still=1&hud=0&pose=hero` freezes motion for exact frame comparisons. `?experience=legacy&site=deep` remains a separate baseline. Generated captures/reports are ignored by Git.

## Boundaries and remaining visual work

M1 establishes the vehicle, local deep-sea environment and capture tools. It is not the 3–5 minute playable story yet. Dynamic thruster sediment, sound, sonar, mining, unknown contact and stage keys 1/3–7 are not implemented.

Movement has inertia and damping but is not hydrodynamic simulation. The tether is a static curved mesh; it follows the ROV and does not simulate a surface vessel. Rock collision is intentionally absent, so free exploration can intersect individual rocks. The fixed recording poses were checked separately. Full terrain-aware fog, finer terrain micro-relief and more nuanced mechanical wear remain useful M2 art improvements. WebGPU is not active in M1.
