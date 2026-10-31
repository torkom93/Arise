/** Runs the actual game commands with Babylon NullEngine. This is simulation QA, not browser/visual QA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..');
class Element{
 constructor(){this.children=[];this.dataset={};this.style={};this.events={};this.classes=new Set();this.textContent='';this.disabled=false;this.parentElement=null;}
 classList={add:(c)=>this.classes.add(c),remove:(c)=>this.classes.delete(c),contains:(c)=>this.classes.has(c),toggle:(c,on)=>{on??=!this.classes.has(c);on?this.classes.add(c):this.classes.delete(c);}};
 appendChild(e){this.children.push(e);e.parentElement=this;return e;}append(...items){items.forEach(e=>this.appendChild(e));}replaceChildren(...es){this.children=[];this.append(...es);}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(e=>e!==this);}addEventListener(name,callback){this.events[name]=callback;}set innerHTML(html){this.html=html;this.children=[];}get innerHTML(){return this.html??'';}get childElementCount(){return this.children.length;}get firstElementChild(){return this.children[0];}getContext(){return new Proxy({},{get:()=>()=>{}});}
}
const html=await readFile(join(root,'index.html'),'utf8');const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
for(const id of ['building-catalog','region-catalog','recipe-catalog','item-actions'])elements.set(id,new Element());
const selectors=new Map();globalThis.document={removeEventListener(){},addEventListener(){},getElementById:id=>{assert.ok(elements.has(id),`Missing HTML id: ${id}`);return elements.get(id);},createElement:()=>new Element(),createTextNode:t=>({textContent:t}),querySelector:selector=>{if(!selectors.has(selector))selectors.set(selector,new Element());return selectors.get(selector);}};
globalThis.window={devicePixelRatio:1,addEventListener(){},removeEventListener(){},setTimeout(){}};
globalThis.HTMLInputElement=class {};globalThis.HTMLTextAreaElement=class {};
const stored=new Map();globalThis.localStorage={getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)};
const dir=await mkdtemp(join(root,'.simulation-test-'));
let source=await readFile(join(root,'src/main.ts'),'utf8');
source=source.replace("import './style.css';",'').replace("from './content'","from './content.mjs'").replace("from './art'","from './art.mjs'").replace("from './professions'","from './professions.mjs'").replace("from './defences'","from './defences.mjs'").replace(/Engine, Scene,/, 'NullEngine, Scene,').replace("from '@babylonjs/core'",`from '${import.meta.resolve('@babylonjs/core')}'`).replace(/const engine = new Engine\(canvas, true, \{ preserveDrawingBuffer: false, stencil: true \}\);/,"const engine = new NullEngine({renderWidth:800,renderHeight:600,textureSize:512,deterministicLockstep:true,lockstepMaxSteps:4});");
source=source.slice(0,source.indexOf('engine.runRenderLoop('));
source+=`\nexport {loadRegion,createStructure,createTroop,placementProblem,trainTroop,cancelTraining,upgradeHall,upgradeBuilding,startResearch,trade,updateProduction,updateEconomy,updateUnit,order,startBuilding,tryPlaceBuilding,damage,missionState,selectEntity,first,entities,scene,engine,createRawResource,createEnemy,toggleGate,moveToward,autoCombat,solidBarrier,barrierShape,startCraft,updateCrafting,cancelCraft,useCraftedItem,acceptQuest,questProgress,turnInQuest,showVinnie,showProfessions,showJournal,closeModal,tree,ground};\nexport const inspect=()=>({wood,stone,food,hallLevel,region,research:{...research},guardsTrained,gameEnded,materials:{...materials},professions:{...professions},quests:structuredClone(quests),activeCraft:activeCraft?{...activeCraft}:null,crafted:{...crafted},gathered:{...gathered}});\nexport function fund(w=10000,s=10000,f=10000){wood=w;stone=s;food=f;}
export function stock(data){Object.assign(materials,data);}
export function skill(key,xp){professions[key]=xp;}
export function rotate(angle){buildRotation=angle;}\n`;
await writeFile(join(dir,'main.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
await writeFile(join(dir,'content.mjs'),ts.transpileModule(await readFile(join(root,'src/content.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
for(const name of ['professions','defences','art'])await writeFile(join(dir,name+'.mjs'),ts.transpileModule((await readFile(join(root,'src/'+name+'.ts'),'utf8')).replace("from '@babylonjs/core'",`from '${import.meta.resolve('@babylonjs/core')}'`),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
let game;
try{game=await import(pathToFileURL(join(dir,'main.mjs')));}catch(e){await rm(dir,{recursive:true,force:true});throw e;}
function fresh(id=1){game.loadRegion(id,true);game.fund();}
test('all ten regions initialize a complete mission and coastal terrain',()=>{
 for(let id=1;id<=10;id++){fresh(id);const state=game.inspect();assert.equal(state.region.id,id);assert.ok(game.first('hero'));assert.ok(game.first('base'));assert.ok(game.first('rift'));assert.equal(game.first('rift').maxHp,state.region.riftHP);assert.equal(game.missionState().length,4);assert.equal(game.missionState().filter(o=>o.done).length,0);}
});
test('hall upgrades consume once, take time and gate Market Place',()=>{
 fresh();const pos=game.first('base').root.position.clone();pos.set(-16,0,-3);
 assert.match(game.placementProblem('market',pos),/3/);
 game.upgradeHall();assert.equal(game.inspect().wood,9780);game.upgradeHall();assert.equal(game.inspect().wood,9780);
 game.updateProduction(24);assert.equal(game.inspect().hallLevel,1);game.updateProduction(1);assert.equal(game.inspect().hallLevel,2);
 assert.match(game.placementProblem('market',pos),/3/);game.upgradeHall();game.updateProduction(40);assert.equal(game.inspect().hallLevel,3);assert.equal(game.placementProblem('market',pos),null);
});
test('training reserves cost, queues to 5, completes actual troop, refunds last queued',()=>{
 fresh();const b=game.createStructure('barracks',-14,-6);game.selectEntity(b);
 for(let i=0;i<6;i++)game.trainTroop(b,'guard');assert.equal(b.queue.length,5);assert.equal(game.inspect().wood,10000-5*55);
 game.updateProduction(7);assert.equal(game.inspect().guardsTrained,0);game.updateProduction(1);assert.equal(game.inspect().guardsTrained,1);assert.equal([...game.entities.values()].filter(e=>e.kind==='guard').length,1);
 game.cancelTraining(b);assert.equal(b.queue.length,3);assert.equal(game.inspect().wood,10000-4*55);
});
test('construction blocks production, invalid producer cannot recruit, food required',()=>{
 fresh();const b=game.createStructure('barracks',-14,-6);b.construction={remaining:14,total:14};game.trainTroop(b,'guard');assert.equal(b.queue,undefined);
 game.updateProduction(14);game.trainTroop(b,'warship');assert.equal(b.queue,undefined);
 game.fund(1000,1000,0);game.trainTroop(b,'guard');assert.equal(b.queue,undefined);
});
test('all 12 troop types spawn through the right production buildings',()=>{
 for(const [kind,building] of [['guard','barracks'],['spearman','barracks'],['archer','archeryRange'],['crossbowman','archeryRange'],['scout','stable'],['knight','stable'],['ram','siegeWorkshop'],['catapult','siegeWorkshop'],['monk','monastery'],['champion','castle'],['fishingBoat','dock'],['warship','harbor']]){
  fresh(2);const b=game.createStructure(building,-8,building==='dock'||building==='harbor'?20:-2);game.trainTroop(b,kind);assert.equal(b.queue.length,1,kind);game.updateProduction(30);const troop=[...game.entities.values()].find(e=>e.kind===kind);assert.ok(troop,kind);if(kind==='fishingBoat'||kind==='warship')assert.ok(troop.root.position.z>=22);
 }
});
test('economic buildings produce and deplete shared finite deposits',()=>{
 fresh();game.fund(0,0,0);game.createStructure('farm',-15,0);game.updateEconomy(1);assert.equal(game.inspect().food,2);game.createStructure('mill',-10,0);game.updateEconomy(1);assert.equal(game.inspect().food,5);
 const node=game.first('wood');game.createStructure('sawMill',node.root.position.x+6,node.root.position.z);const before=node.amount;game.updateEconomy(1);assert.equal(node.amount,before-3);assert.equal(game.inspect().wood,3);
 node.amount=1;game.updateEconomy(1);assert.equal(game.inspect().wood,4);assert.equal(game.entities.has(node.id),false);
});
test('Monastery and Dock upgrade in place after hall 3',()=>{
 fresh(2);game.upgradeHall();game.updateProduction(25);game.upgradeHall();game.updateProduction(40);
 for(const [before,after,z] of [['monastery','fortifiedChurch',5],['dock','harbor',20]]){
  const b=game.createStructure(before,-7,z);const id=b.id;game.upgradeBuilding(b,after);assert.ok(b.upgrading);game.updateProduction(28);assert.equal(b.kind,after);assert.equal(b.id,id);assert.ok(b.maxHp>500);
 }
});
test('research affects damage and market trades cannot create free resources',()=>{
 fresh();const smith=game.createStructure('blacksmith',-12,0);game.startResearch(smith,'arms');game.updateProduction(25);assert.equal(game.inspect().research.arms,true);
 const unit=game.createTroop('archer',10,0);const enemy=[...game.entities.values()].find(e=>e.kind==='enemy');const hp=enemy.hp;game.damage(enemy,10,unit);assert.ok(Math.abs(enemy.hp-(hp-12*(1-2/102)))<.00001);
 game.upgradeHall();game.updateProduction(25);game.upgradeHall();game.updateProduction(40);const market=game.createStructure('market',-12,-3);game.selectEntity(market);game.fund(100,0,0);game.trade('wood');assert.equal(game.inspect().wood,0);assert.equal(game.inspect().stone,60);game.trade('wood');assert.equal(game.inspect().stone,60);
});
test.after(async()=>{game.engine.dispose();await rm(dir,{recursive:true,force:true});});
test('coastal placement rejects inland docks and land buildings in water',()=>{
 fresh(2);const p=game.first('base').root.position.clone();p.set(-15,0,0);assert.match(game.placementProblem('dock',p),/strandlinjen/);
 p.set(-10,0,24);assert.equal(game.placementProblem('fishTrap',p),null);assert.ok(game.placementProblem('farm',p));
 fresh(1);assert.match(game.placementProblem('dock',p),/kystkart/);
});
test('land units reject water orders and boats reject land orders',()=>{
 fresh(2);const hero=game.first('hero');const boat=game.createTroop('fishingBoat',-10,26);const target=hero.root.position.clone();target.set(0,0,26);game.order(hero,undefined,target);assert.equal(hero.moveTarget,undefined);
 target.set(0,0,0);game.order(boat,undefined,target);assert.equal(boat.moveTarget,undefined);
 target.set(10,0,26);game.order(boat,undefined,target);game.updateUnit(boat,1);assert.ok(boat.root.position.x>-10);assert.ok(boat.root.position.z>=22);
});
test('monks heal troops and siege units damage structures more than infantry',()=>{
 fresh();const guard=game.createTroop('guard',-15,0);guard.hp=50;const monk=game.createTroop('monk',-14,0);game.updateUnit(monk,.1);assert.equal(guard.hp,62);game.updateUnit(monk,.1);assert.equal(guard.hp,62);
 // The rift shield must be broken by recruitment before siege damage can apply.
 const b=game.createStructure('barracks',-14,-5);game.trainTroop(b,'guard');game.trainTroop(b,'guard');game.updateProduction(8);game.updateProduction(8);
 const ram=game.createTroop('ram',10,8);const rift=game.first('rift');const hp=rift.hp;game.damage(rift,24,ram);assert.equal(rift.hp,hp-72);
});
test('all ten region configurations can complete the actual four-objective victory flow',()=>{
 for(let id=1;id<=10;id++){
  fresh(id);const workers=game.first('workers');
  for(const [kind,seconds] of [['wood',6],['stone',4]]){const deposit=game.first(kind);workers.root.position.copyFrom(deposit.root.position);workers.targetId=deposit.id;game.updateUnit(workers,seconds);}
  game.startBuilding('barracks');const site=workers.root.position.clone();site.set(-16,0,-3);game.tryPlaceBuilding(site);const barracks=game.first('barracks');assert.ok(barracks);game.updateProduction(14);
  game.trainTroop(barracks,'guard');game.trainTroop(barracks,'guard');game.updateProduction(8);game.updateProduction(8);
  game.damage(game.first('rift'),5000,game.first('guard'));assert.equal(game.inspect().gameEnded,true,`region ${id}`);assert.ok(game.missionState().every(o=>o.done),`region ${id}`);
 }
});
test('every entity has finite combat stats and Vinnie is unique to map 1',()=>{
 fresh();assert.equal([...game.entities.values()].filter(e=>e.kind==='vinnie').length,1);assert.equal(game.first('vinnie').team,'neutral');
 for(const e of game.entities.values())for(const stat of ['hp','maxHp','armor','speed','range','damage','cooldown','level','sight'])assert.ok(Number.isFinite(e[stat]),e.kind+': '+stat);
 fresh(2);assert.equal(game.first('vinnie'),undefined);
});
test('gathering all new resources credits inventory and relevant profession XP',()=>{
 fresh();const workers=game.first('workers');
 for(const kind of ['rock','iron','clay','herbs']){const node=game.first(kind);workers.root.position.copyFrom(node.root.position);game.order(workers,node,node.root.position);game.updateUnit(workers,1);assert.ok(game.inspect().materials[kind]>=15,kind);assert.ok(node.amount<200);}
 assert.ok(game.inspect().professions.mining>=9);assert.ok(game.inspect().professions.alchemy>=3);
});
test('crafting charges once, respects skill/station locks, and only yields on completion',()=>{
 fresh();game.stock({clay:30,rock:20});const before=game.inspect().wood;
 assert.equal(game.startCraft('bricks'),true);assert.equal(game.inspect().wood,before-5);assert.equal(game.startCraft('bricks'),false);assert.equal(game.inspect().wood,before-5);
 game.updateCrafting(5);assert.equal(game.inspect().materials.brick,undefined);game.updateCrafting(1);assert.equal(game.inspect().materials.brick,5);assert.equal(game.inspect().professions.masonry,12);
 game.stock({ironBar:20,plank:20});assert.equal(game.startCraft('weapons'),false);game.skill('smithing',30);assert.equal(game.startCraft('weapons'),false);game.createStructure('blacksmith',-12,0);assert.equal(game.startCraft('weapons'),true);
 game.updateCrafting(12);assert.equal(game.inspect().materials.weaponKit,1);
});
test('salves heal and crafted equipment cannot stack repeatedly on one unit',()=>{
 fresh();const hero=game.first('hero');game.selectEntity(hero);game.stock({salve:2,weaponKit:2,armorKit:2});
 assert.equal(game.useCraftedItem('salve'),false);assert.equal(game.inspect().materials.salve,2);hero.hp=100;assert.equal(game.useCraftedItem('salve'),true);assert.equal(hero.hp,180);
 const d=hero.damage,a=hero.armor;assert.equal(game.useCraftedItem('weaponKit'),true);assert.equal(hero.damage,d+4);assert.equal(game.useCraftedItem('weaponKit'),false);assert.equal(game.inspect().materials.weaponKit,1);
 assert.equal(game.useCraftedItem('armorKit'),true);assert.equal(hero.armor,a+5);assert.equal(game.useCraftedItem('armorKit'),false);
});
test('closed gates block, opening permits passage, closing cannot trap a unit',()=>{
 fresh();const gate=game.createStructure('gate',0,0),unit=game.createTroop('guard',0,-4);const destination=unit.root.position.clone();destination.z=4;
 game.moveToward(unit,destination,1);assert.ok(unit.root.position.z<0);assert.equal(game.solidBarrier(gate),true);
 game.toggleGate(gate);assert.equal(game.solidBarrier(gate),false);unit.root.position.set(0,0,0);game.toggleGate(gate);assert.equal(gate.gateOpen,true);
 unit.root.position.z=5;game.toggleGate(gate);assert.equal(gate.gateOpen,false);
});
test('enemies attack walls that stop their approach and cannot walk through them',()=>{
 fresh();const wall=game.createStructure('brickWall',0,0),enemy=game.createEnemy(0,-3);const p=enemy.root.position.clone();p.z=3;
 game.moveToward(enemy,p,1);assert.equal(enemy.blockedBy,wall.id);const hp=wall.hp;game.updateUnit(enemy,1);assert.ok(wall.hp<hp);assert.ok(enemy.root.position.z<0);
});
test('Bomber Tower damages clustered enemies without hurting allies',()=>{
 fresh();game.createStructure('bomberTower',-8,0);const a=game.createEnemy(-2,0),b=game.createEnemy(-1,1),friend=game.createTroop('guard',-2,1);const hp=friend.hp;
 game.autoCombat(.61);assert.ok(a.hp<85);assert.ok(b.hp<85);assert.equal(friend.hp,hp);
});
test('Vinnie quests enforce collection after acceptance and one-time rewards',()=>{
 fresh();game.showVinnie();game.closeModal();const workers=game.first('workers');
 assert.equal(game.acceptQuest('defences'),true);assert.equal(game.acceptQuest('defences'),false);
 for(const [kind,time] of [['clay',2],['rock',1]]){const node=game.first(kind);workers.root.position.copyFrom(node.root.position);workers.targetId=node.id;game.updateUnit(workers,time);}
 assert.equal(game.startCraft('bricks'),true);game.updateCrafting(6);assert.equal(game.questProgress('defences').ready,false);
 const wall=game.createStructure('brickWall',-5,5);wall.construction={remaining:10,total:10};game.updateProduction(10);assert.equal(game.questProgress('defences').ready,true);
 const before=game.inspect().wood;assert.equal(game.turnInQuest('defences'),true);assert.equal(game.inspect().wood,before+80);assert.equal(game.turnInQuest('defences'),false);
 assert.equal(game.acceptQuest('medicine'),true);const herbs=game.first('herbs');workers.root.position.copyFrom(herbs.root.position);workers.targetId=herbs.id;game.updateUnit(workers,1);
 for(let i=0;i<3;i++){assert.equal(game.startCraft('salves'),true);game.updateCrafting(5);}assert.equal(game.questProgress('medicine').ready,true);
 game.first('hero').root.position.x=40;assert.equal(game.turnInQuest('medicine'),false);game.first('hero').root.position.copyFrom(game.first('vinnie').root.position);
 assert.equal(game.turnInQuest('medicine'),true);assert.equal(game.inspect().materials.salve,0);assert.equal(game.turnInQuest('medicine'),false);
});
test('recipe and quest menus can open, and region changes reset local progression',()=>{
 fresh();game.showProfessions();game.closeModal();game.showJournal();game.closeModal();game.skill('smithing',90);game.stock({salve:5});game.acceptQuest('medicine');
 game.loadRegion(2,true);assert.equal(game.inspect().professions.smithing,0);assert.equal(game.inspect().materials.salve,undefined);assert.equal(game.inspect().quests.medicine.status,'available');
});
test('all detailed building models preserve picking, finite geometry and local transforms',async()=>{
 const {BUILDINGS}=await import('../src/content.ts');fresh();
 for(const kind of Object.keys(BUILDINGS)){
  const e=game.createStructure(kind,12,-6);const model=e.root.getChildMeshes().filter(m=>m.isPickable);
  assert.ok(model.length>0&&model.length<30,kind+' draw batches');
  for(const mesh of model){assert.equal(mesh.metadata.entityId,e.id);assert.equal(mesh.metadata.visualKind,kind);assert.ok(mesh.getTotalVertices()>0);mesh.computeWorldMatrix(true);const bounds=mesh.getBoundingInfo().boundingBox;assert.ok(bounds.minimumWorld.x>1&&bounds.maximumWorld.x<23,kind+' local x');assert.ok(bounds.minimumWorld.z>-17&&bounds.maximumWorld.z<5,kind+' local z');for(const v of mesh.getVerticesData('position'))assert.ok(Number.isFinite(v),kind+' position');}
 }
});
test('terrain texture, shallow relief and tree picking survive region reload',()=>{
 fresh();const terrain=game.ground;assert.equal(terrain.metadata.terrain,true);assert.equal(terrain.isPickable,true);assert.equal(terrain.material.diffuseTexture.getSize().width,512);assert.ok(terrain.material.bumpTexture);
 const positions=terrain.getVerticesData('position');let lo=0;for(let i=1;i<positions.length;i+=3){assert.ok(positions[i]<=0&&positions[i]>=-.12);lo=Math.min(lo,positions[i]);}assert.ok(lo<-.025);
 const wood=game.first('wood');const meshes=wood.root.getChildMeshes().filter(m=>m.isPickable);assert.ok(meshes.length>0);assert.ok(meshes.every(m=>m.metadata.entityId===wood.id));
 const texture=terrain.material.diffuseTexture;game.loadRegion(2,true);assert.notEqual(terrain.material.diffuseTexture,texture);game.loadRegion(1,true);assert.equal(terrain.material.diffuseTexture,texture);
 assert.ok(game.scene.meshes.filter(m=>m.metadata?.decoration).every(m=>!m.isPickable));
});
