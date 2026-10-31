import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDINGS,TROOPS,REGIONS,buildingLock,economyRate,canAfford} from '../src/content.ts';
test('all requested structures and both upgrade chains exist',()=>{
 for(const key of ['market','farm','mill','miningCamp','fishTrap','sawMill','blacksmith','university','barracks','archeryRange','stable','siegeWorkshop','monastery','fortifiedChurch','castle','dock','harbor'])assert.ok(BUILDINGS[key],key);
 assert.equal(BUILDINGS.monastery.upgrade,'fortifiedChurch');assert.equal(BUILDINGS.dock.upgrade,'harbor');
 assert.equal(BUILDINGS.fortifiedChurch.upgradeOnly,true);assert.equal(BUILDINGS.harbor.upgradeOnly,true);
});
test('Market Place requires hall 3 and naval structures require a coast',()=>{
 for(const level of [1,2])assert.match(buildingLock('market',level,false),/3/);
 assert.equal(buildingLock('market',3,false),null);
 for(const kind of ['dock','fishTrap','harbor'])assert.ok(buildingLock(kind,3,false));
 assert.equal(buildingLock('dock',1,true),null);
});
test('ten regions have unique deterministic layouts with valid land spawns',()=>{
 assert.deepEqual(REGIONS.map(r=>r.id),[1,2,3,4,5,6,7,8,9,10]);
 assert.equal(new Set(REGIONS.map(r=>r.seed)).size,10);
 assert.equal(new Set(REGIONS.map(r=>JSON.stringify([r.wood,r.aether,r.rift]))).size,10);
 assert.equal(REGIONS.filter(r=>r.coastal).length,3);
 for(const r of REGIONS)for(const [x,z] of [...r.wood,...r.aether,...r.enemies,r.rift]){assert.ok(Math.abs(x)<45&&Math.abs(z)<34,r.name);if(r.coastal)assert.ok(z<22,r.name);}
});
test('every troop has a valid producer with reciprocal training data',()=>{
 assert.equal(Object.keys(TROOPS).length,12);
 for(const [key,t] of Object.entries(TROOPS)){assert.ok(t.seconds>0&&t.hp>0&&t.speed>0);for(const b of t.producer)assert.ok(BUILDINGS[b].producer.includes(key));}
 for(const [key,b] of Object.entries(BUILDINGS))for(const t of b.producer??[])assert.ok(TROOPS[t].producer.includes(key));
});
test('food affordability and economic bonuses have real effects',()=>{
 assert.equal(canAfford({wood:100,stone:100,food:0},TROOPS.guard.cost),false);
 assert.equal(canAfford({wood:55,stone:35,food:20},TROOPS.guard.cost),true);
 assert.equal(economyRate('farm',false,false),2);assert.equal(economyRate('farm',true,false),3);assert.equal(economyRate('farm',true,true),3.75);
 assert.equal(economyRate('sawMill',false,true),3.75);assert.equal(economyRate('market',true,true),0);
});
