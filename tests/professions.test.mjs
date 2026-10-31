import test from 'node:test';
import assert from 'node:assert/strict';
import {RECIPES,PROFESSIONS,RESOURCE_DEFS,ITEM_NAMES,newProfessionState,professionLevel,recipeLock,mitigation} from '../src/professions.ts';
import {BUILDINGS,canAfford} from '../src/content.ts';
import {barrierDistance,crossesBarrier} from '../src/defences.ts';
test('profession thresholds unlock equipment recipes and cap at level 5',()=>{
 const state=newProfessionState();assert.equal(Object.keys(state).length,6);assert.equal(professionLevel(0),1);assert.equal(professionLevel(30),2);assert.equal(professionLevel(90),3);assert.equal(professionLevel(99999),5);
 assert.match(recipeLock(RECIPES.weapons,state,['blacksmith']),/nivå 2/);state.smithing=30;assert.match(recipeLock(RECIPES.weapons,state,[]),/Blacksmith/);assert.equal(recipeLock(RECIPES.weapons,state,['blacksmith']),null);
});
test('recipes form valid raw-material-to-building/equipment chains',()=>{
 const valid=new Set([...Object.keys(RESOURCE_DEFS),...Object.keys(ITEM_NAMES)]);
 for(const recipe of Object.values(RECIPES)){assert.ok(PROFESSIONS[recipe.profession]);assert.ok(ITEM_NAMES[recipe.output]);assert.ok(recipe.seconds>0&&recipe.xp>0&&recipe.count>0);for(const [key,n] of Object.entries(recipe.cost.materials??{})){assert.ok(valid.has(key),key);assert.ok(n>0);}if(recipe.station)assert.ok(BUILDINGS[recipe.station]);}
 for(const key of ['brickWall','gate','guardTower','bomberTower'])for(const material of Object.keys(BUILDINGS[key].cost.materials??{}))assert.ok(Object.values(RECIPES).some(r=>r.output===material));
});
test('defence costs cannot be paid without crafted materials',()=>{
 assert.equal(canAfford({wood:1000,stone:1000,food:1000},BUILDINGS.brickWall.cost),false);
 assert.equal(canAfford({wood:1000,stone:1000,food:1000,materials:{brick:5}},BUILDINGS.brickWall.cost),true);
});
test('armour reduces damage up to 50%, including invalid negative armour',()=>{assert.equal(mitigation(0),1);assert.equal(mitigation(100),.5);assert.equal(mitigation(1000),.5);assert.equal(mitigation(-5),1);});
test('rotated wall rectangles block swept movement without tunnelling',()=>{
 const horizontal={x:0,z:0,rotation:0,halfWidth:4,halfDepth:.7};assert.equal(crossesBarrier(0,-5,0,5,horizontal),true);assert.equal(crossesBarrier(6,-5,6,5,horizontal),false);assert.equal(barrierDistance(0,0,horizontal),0);
 const vertical={...horizontal,rotation:Math.PI/2};assert.equal(crossesBarrier(-5,0,5,0,vertical),true);assert.equal(crossesBarrier(0,-6,5,-6,vertical),false);
});
