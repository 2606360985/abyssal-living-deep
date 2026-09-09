import assert from 'node:assert/strict';
import { GameState,STAGES } from '../src/miner/core/GameState.js';
import { SequenceDirector } from '../src/miner/core/SequenceDirector.js';
import { sampleData } from '../src/miner/scene/NoduleField.js';
import { solveTwoBone } from '../src/miner/rov/SamplingArm.js';
import { Vector3 } from 'three';
const state=new GameState();let cleanups=0,entries=0;
const app={state,keys:new Set(),audio:{reset(){}},hud:{clearMessages(){}},resetWorld(){state.dispatch('reset');}};
const director=new SequenceDirector(app);for(const id of STAGES)director.register(id,{enter(){entries++;},exit(){cleanups++;}});
for(let i=0;i<20;i++)for(const stage of STAGES){director.goto(stage);state.dispatch('samplingStarted');state.dispatch('sampleAcquired',{sample:sampleData(0)});assert.equal(state.inputLocked,false);assert.equal(state.stage,stage);}
assert.equal(entries,140);assert.equal(cleanups,139);director.goto(2);assert.equal(state.sample,null);assert.equal(director.id,'arrival');
for(let i=0;i<100;i++){const data=sampleData(i);assert.deepEqual(data,sampleData(i));assert.ok(Math.abs(Object.values(data.composition).reduce((a,b)=>a+b,0)-100)<.001);assert.ok(data.mass>0&&data.value>0);}
assert.throws(()=>state.dispatch('invalid'));console.log('Miner reducer, stage cleanup, deterministic assay tests passed.');
const shoulder=new Vector3(-.55,-.34,.65);for(const target of [new Vector3(-.5,-1,1.5),new Vector3(.4,-.8,1.3),new Vector3(-1,-.9,1.6)]){const elbow=solveTwoBone(shoulder,target);assert.ok(elbow);assert.ok(Math.abs(elbow.distanceTo(shoulder)-1.15)<1e-8);assert.ok(Math.abs(elbow.distanceTo(target)-1.1)<1e-8);}
assert.equal(solveTwoBone(shoulder,new Vector3(10,10,10)),null);assert.equal(solveTwoBone(shoulder,shoulder),null);console.log('IK link lengths and unreachable-workspace rejection passed.');
