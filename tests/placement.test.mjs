import test from 'node:test';
import assert from 'node:assert/strict';
import {snapBuilding,footprintCells,overlaps,footprintSize} from '../src/placement.ts';
test('grid snapping uses whole cells at positive and negative coordinates, including rotated walls',()=>{
 for(const kind of ['house','kitchen','barracks','brickWall','gate','dock'])for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2])for(const [x,z] of [[1.3,-2.7],[-21.8,13.6]]){
  const area=snapBuilding(kind,x,z,angle);
  assert.equal((area.x-area.width/2)%2===0,true);assert.equal((area.z-area.depth/2)%2===0,true);
  assert.ok(Math.abs(area.x-x)<=1&&Math.abs(area.z-z)<=1);
  assert.equal(footprintCells(area).length,area.width*area.depth/4);
 }
 assert.deepEqual(footprintSize('brickWall',Math.PI/2),[2,8]);
});
test('footprints reject partial overlaps but allow touching cell boundaries',()=>{
 const a={x:0,z:0,width:8,depth:8};
 assert.equal(overlaps(a,{...a,x:6}),true);assert.equal(overlaps(a,{...a,x:8}),false);
 assert.equal(overlaps(a,{...a,z:-8}),false);assert.equal(overlaps(a,{...a,x:-7.9}),true);
});

test('adjoining wall sections reserve consecutive cells without a gap',()=>{
 const a=snapBuilding('brickWall',0,1),b=snapBuilding('gate',8,1);
 assert.equal(overlaps(a,b),false);assert.equal(a.x+a.width/2,b.x-b.width/2);
});
