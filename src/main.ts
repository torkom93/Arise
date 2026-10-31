import './style.css';
import {GRID_SIZE,footprintSize,snapBuilding,overlaps,footprintCells} from './placement';
import {AriseArt} from './art';
import {RESOURCE_DEFS, ITEM_NAMES, PROFESSIONS, RECIPES, QUESTS, isResourceKind, newProfessionState, professionLevel, gatherMultiplier, recipeLock, mitigation, newQuestState, XP_THRESHOLDS, type ResourceKind, type ItemKind, type Profession, type QuestKey} from './professions';
import {barrierDistance,crossesBarrier,type Barrier} from './defences';
import {BUILDINGS, TROOPS, REGIONS, HALL_UPGRADES, RESEARCH, isBuildingKind, isTroopKind, buildingLock, canAfford, economyRate, type BuildingKind, type TroopKind, type Cost} from './content';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Color3,
  Color4, MeshBuilder, Mesh, TransformNode, StandardMaterial, GlowLayer,
  PointerEventTypes, AbstractMesh, Matrix
} from '@babylonjs/core';

type Kind = ResourceKind | 'vinnie' | 'hero' | 'workers' | 'enemy' | 'wood' | 'stone' | 'base' | 'rift' | BuildingKind | TroopKind;
type Team = 'ally' | 'enemy' | 'neutral';
type BuildKind = BuildingKind;
type OrderMode = 'move' | 'gather' | 'attack' | null;
interface Entity {
  id: string;
  kind: Kind;
  team: Team;
  root: TransformNode;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  range: number;
  cooldown: number;
  attackClock: number;
  armor:number;
  level:number;
  sight:number;
  gateOpen?:boolean;
  alertClock?:number;
  blockedBy?:string;
  weaponEquipped?:boolean;
  armorEquipped?:boolean;
  moveTarget?: Vector3;
  targetId?: string;
  amount?: number;
  selectionRing?: Mesh;
  visual?: Mesh;
  phase: number;
  construction?: {remaining:number;total:number};
  queue?: {kind:TroopKind;remaining:number;total:number}[];
  upgrading?: {target:BuildingKind|'hall2'|'hall3';remaining:number;total:number};
  researching?: {key:keyof typeof RESEARCH;remaining:number;total:number};
}
interface Projectile { mesh: Mesh; from: Vector3; to: Vector3; age: number; duration: number; }
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('renderCanvas');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true });
engine.setHardwareScalingLevel(window.devicePixelRatio > 1.75 ? 1.35 : 1);
const scene = new Scene(engine);
scene.clearColor = new Color4(.025,.090,.101,1);
scene.ambientColor = Color3.FromHexString('#81989d');
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = Color3.FromHexString('#173a3d');
scene.fogDensity = .0060;
const camera = new ArcRotateCamera('tactical-camera', -Math.PI / 2.15, 1.02, 67, new Vector3(-6, 0, -1), scene);
camera.inputs.clear();
camera.minZ = .1;
camera.maxZ = 220;
camera.fov = .70;
const sky = new HemisphericLight('ambient skylight', new Vector3(.1,1,.3),scene);
sky.intensity = 1.2;
sky.diffuse = Color3.FromHexString('#d6e6d5');
sky.groundColor = Color3.FromHexString('#223d3b');
const sun = new DirectionalLight('western sun',new Vector3(-.55,-1,-.3),scene);
sun.intensity = 1.55;
sun.diffuse = Color3.FromHexString('#ffe7b7');
const glow = new GlowLayer('magic-glow',scene,{blurKernelSize:24});
glow.intensity = .52;

const MAP_W = 90, MAP_D = 68;
const entities = new Map<string,Entity>();
const projectiles: Projectile[] = [];
const mats = new Map<string,StandardMaterial>();
let nextId = 0;
let gameStarted = false, paused = false, gameEnded = false;
let selectedId: string | null = 'hero';
let buildMode: BuildKind | null = null, orderMode: OrderMode = null;
let wood = 90, stone = 65, gatheredWood = 0, gatheredStone = 0, guardsTrained = 0;
let gameTime = 0, waveClock = 0, hudClock = 0, minimapClock = 0, aiClock = 0, rallyCooldown = 0, rallyActive = 0;
let lastShieldToast = -100;
const costs = Object.fromEntries(Object.entries(BUILDINGS).map(([k,d])=>[k,d.cost])) as Record<BuildKind,Cost>;
let food=100, hallLevel=1;
let region=REGIONS[0];
let seed=region.seed;
let research = {arms:false,logistics:false};
let economyClock=0, armySelected=false, objectiveBarracks=false, unitsLost=0;
const queueLimit=5, armyLimit=40;
let materials:Record<string,number>={};
let professions=newProfessionState();
let quests=newQuestState();
let gathered:Record<string,number>={};
let crafted:Record<string,number>={};
let builtWalls=0, buildRotation=0;
let activeCraft:{recipeId:string;remaining:number;total:number;stationId?:string}|null=null;
const basePos = new Vector3(-26,0,-10);
const riftPos = new Vector3(31,0,14);
const alive = (id: string | null | undefined) => id ? entities.get(id) : undefined;
const clamp = (n:number,a:number,b:number) => Math.max(a,Math.min(b,n));
const planarDistance = (a: Vector3,b:Vector3) => Math.hypot(a.x-b.x,a.z-b.z);
const v3 = (x:number,z:number,y=0) => new Vector3(x,y,z);
const rand = () => { seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
const between = (a:number,b:number) => a + (b-a)*rand();
const tint = (hex:string) => Color3.FromHexString(hex);
function material(key:string,hex:string,emissive?:string,alpha=1):StandardMaterial {
  const cache = key + alpha;
  const found = mats.get(cache); if(found)return found;
  const m = new StandardMaterial(key,scene);
  m.diffuseColor=tint(hex);
  m.specularColor=new Color3(.08,.11,.09);
  m.ambientColor=tint(hex).scale(.36);
  if(emissive) m.emissiveColor=tint(emissive);
  m.alpha=alpha;
  mats.set(cache,m);
  return m;
}
const art=new AriseArt(scene);
const M = {
  earth:material('earth','#234740'),
  grass:material('grass','#3a6650'),
  darkGrass:material('dark grass','#1c3f3b'),
  olive:material('olive','#667b4c'),
  leaf:material('pine foliage','#2b6756'),
  leaf2:material('second foliage','#37816a'),
  bark:material('bark','#795a41'),
  sandstone:material('sandstone','#bdac86'),
  stone:material('building stone','#63736c'),
  darkStone:material('basalt','#2b4148'),
  roof:material('roof','#506e6a'),
  gold:material('gold','#e5b967','#493118'),
  goldGlow:material('gold glow','#e7bd75','#a07533'),
  linen:material('linen','#cbc9ae'),
  blue:material('aether blue','#56b9ce','#174954'),
  crystal:material('glowing crystal','#7adfe7','#30b3c0'),
  crystalDark:material('crystal dark','#3e9cb1','#145368'),
  hero:material('hero armor','#cbb37b'),
  heroBlue:material('hero cloak','#328788'),
  worker:material('worker coat','#8ab49b'),
  workerPack:material('worker pack','#ab8864'),
  guard:material('guard mail','#7da4be'),
  enemy:material('corrupt red','#ba5a75','#4c152b'),
  enemyDark:material('enemy dark','#403047'),
  rift:material('rift aura','#9d63d3','#723baa'),
  riftCore:material('rift core','#db9eff','#9b4ded'),
  purpleFloor:material('purple floor','#49345b','#281745',.78),
  shadow:material('contact shadow','#0b2425',undefined,.46),
  selection:material('selection teal','#9df0bf','#48a77a',.85),
  hostile:material('selection red','#e88697','#833042',.9),
  white:material('white','#f8ead7')
};
function prop(mesh:Mesh,parent:TransformNode|undefined, x:number,y:number,z:number, mat:StandardMaterial, pick=false) {
  if(parent)mesh.parent=parent;
  mesh.position.set(x,y,z); mesh.material=mat;
  mesh.isPickable=pick;
  if(parent && pick)mesh.metadata={entityId:parent.name};
  return mesh;
}
function box(parent:TransformNode|undefined,x:number,y:number,z:number,w:number,h:number,d:number,mat:StandardMaterial,pick=false) {
  return prop(MeshBuilder.CreateBox('block',{width:w,height:h,depth:d},scene),parent,x,y,z,mat,pick);
}
function ball(parent:TransformNode|undefined,x:number,y:number,z:number,r:number,mat:StandardMaterial,pick=false) {
  return prop(MeshBuilder.CreateSphere('sphere',{diameter:r*2,segments:7},scene),parent,x,y,z,mat,pick);
}
function cylinder(parent:TransformNode|undefined,x:number,y:number,z:number,diam:number,height:number,mat:StandardMaterial,pick=false,top=diam) {
  return prop(MeshBuilder.CreateCylinder('cylinder',{diameter:diam,diameterTop:top,diameterBottom:diam,height, tessellation:7},scene),parent,x,y,z,mat,pick);
}
function torus(parent:TransformNode|undefined,x:number,y:number,z:number,diam:number,tube:number,mat:StandardMaterial,pick=false) {
  return prop(MeshBuilder.CreateTorus('ring',{diameter:diam,thickness:tube,tessellation:24},scene),parent,x,y,z,mat,pick);
}
function shadow(root:TransformNode,scale:number) {
  const disc=cylinder(root,0,.055,0,scale,.08,M.shadow);
  disc.scaling.z=.75;
}
function defaultArmor(kind:Kind){
 if(isBuildingKind(kind))return BUILDINGS[kind].armor??5;
 const values:Partial<Record<Kind,number>>={hero:6,base:10,enemy:2,guard:8,spearman:4,archer:2,crossbowman:4,scout:4,knight:12,ram:18,catapult:3,monk:0,champion:15,fishingBoat:1,warship:10};
 return values[kind]??0;
}
function newEntity(kind:Kind,team:Team,x:number,z:number,options:Partial<Pick<Entity,'hp'|'speed'|'damage'|'range'|'cooldown'|'amount'|'armor'|'level'|'sight'>>={}):Entity {
  const id = kind + '-' + (++nextId);
  const root=new TransformNode(id,scene);
  root.position.set(x,0,z);
  const hp=options.hp ?? 100;
  const e:Entity={id,kind,team,root,hp,maxHp:hp,speed:options.speed??0,damage:options.damage??0,range:options.range??0,cooldown:options.cooldown??1.1,attackClock:0,armor:options.armor??defaultArmor(kind),level:options.level??(kind==='enemy'?region.id:1),sight:options.sight??(kind==='scout'?26:kind==='hero'?20:kind==='vinnie'?12:16),amount:options.amount,phase:rand()*Math.PI*2};
  entities.set(id,e);
  return e;
}
function selectionRing(e:Entity,r:number) {
  const ring=torus(e.root,0,.17,0,r,.075,e.team==='enemy'?M.hostile:M.selection);
  ring.isVisible=false; ring.isPickable=false;
  e.selectionRing=ring;
}
function unitPart(parent:TransformNode,x:number,z:number,kind:'hero'|'workers'|'guard'|'enemy') {
  const hero=kind==='hero',worker=kind==='workers',enemy=kind==='enemy';
  const body = hero?M.hero:worker?M.worker:enemy?M.enemy:M.guard;
  const coat = hero?M.heroBlue:worker?M.workerPack:enemy?M.enemyDark:M.heroBlue;
  const scale=hero ? 1.18 : worker ? .71 : enemy ? .90 : .85;
  cylinder(parent,x,1.00*scale,z,.95*scale,1.4*scale,body,true,.65*scale);
  ball(parent,x,1.88*scale,z,.39*scale,hero?M.linen:enemy?M.enemy:M.sandstone,true);
  cylinder(parent,x,2.12*scale,z,.50*scale,.27*scale,hero?M.gold:enemy?M.enemyDark:M.darkStone,true,.4*scale);
  box(parent,x,.68*scale,z-.43*scale,.8*scale,.7*scale,.18*scale,coat,true);
  box(parent,x-.25*scale,.25*scale,z,.24*scale,.55*scale,.26*scale,M.darkStone,true);
  box(parent,x+.25*scale,.25*scale,z,.24*scale,.55*scale,.26*scale,M.darkStone,true);
  if(hero || kind==='guard') {
    const weapon=box(parent,x+.68*scale,1.12*scale,z,.12*scale,1.45*scale,.13*scale,hero?M.gold:M.linen,true);
    weapon.rotation.z=-.20;
    box(parent,x+.66*scale,1.52*scale,z,.48*scale,.10*scale,.15*scale,M.gold,true);
    const shield=ball(parent,x-.64*scale,1.16*scale,z,.44*scale,hero?M.heroBlue:M.guard,true);
    shield.scaling.z=.29;
  }
  if(worker) {
    box(parent,x-.35*scale,1.28*scale,z-.48*scale,.75*scale,.86*scale,.42*scale,M.workerPack,true);
    box(parent,x+.49*scale,1.20*scale,z,.13*scale,.97*scale,.13*scale,M.bark,true);
  }
  if(enemy) {
    const hornL=cylinder(parent,x-.28*scale,2.40*scale,z,.20*scale,.64*scale,M.enemyDark,true,0);
    hornL.rotation.z=.42;
    const hornR=cylinder(parent,x+.28*scale,2.40*scale,z,.20*scale,.64*scale,M.enemyDark,true,0);
    hornR.rotation.z=-.42;
  }
}
function createHero() {
  const e=newEntity('hero','ally',-19,-7,{hp:300,speed:7.1,damage:12,range:2.7,cooldown:1.4});
  shadow(e.root,2.9); unitPart(e.root,0,0,'hero');
  torus(e.root,0,.07,0,2.0,.09,M.goldGlow);
  selectionRing(e,3.15);
  return e;
}
function createWorkers() {
  const e=newEntity('workers','ally',-20,-15,{hp:190,speed:5.6});
  shadow(e.root,3.9);
  unitPart(e.root,-1.3,.5,'workers'); unitPart(e.root,1.3,.5,'workers'); unitPart(e.root,0,-1.1,'workers');
  selectionRing(e,4.6);
  return e;
}
function createGuard(x:number,z:number) {
  const e=newEntity('guard','ally',x,z,{hp:135,speed:6.7,damage:20,range:2.7,cooldown:1.05});
  shadow(e.root,2.25); unitPart(e.root,0,0,'guard'); selectionRing(e,2.6);
  return e;
}
function createEnemy(x:number,z:number) {
  const e=newEntity('enemy','enemy',x,z,{hp:85,speed:2.75,damage:11,range:2.35,cooldown:1.22});
  shadow(e.root,2.35); unitPart(e.root,0,0,'enemy'); selectionRing(e,2.6);
  return e;
}
function tree(root:TransformNode|undefined,x:number,z:number,height=1,resource=false) {
  art.tree(root,x,z,height,resource,region.foliage,Math.floor(Math.abs(x*7+z*11))%7);
}
function createWood(x:number,z:number) {
  const e=newEntity('wood','neutral',x,z,{hp:1,amount:440});
  tree(e.root,-1.5,.4,1.2,true);
  tree(e.root,1.8,.7,1,true);
  tree(e.root,0,-1.3,.95,true);
  torus(e.root,0,.10,0,6,.085,M.goldGlow);
  ball(e.root,0,4.9,0,.23,M.goldGlow);
  selectionRing(e,6.4);
  return e;
}
function crystalShard(root:TransformNode,x:number,z:number,height:number,resource=true) {
  const prism=cylinder(root,x,height*.50,z,.60*height,height, M.crystal,resource,.16*height);
  prism.rotation.z=between(-.2,.2);
  const sparkle=ball(root,x,height+0.02,z,.16,M.crystal,true);
  return {prism,sparkle};
}
function createStone(x:number,z:number) {
  const e=newEntity('stone','neutral',x,z,{hp:1,amount:330});
  cylinder(e.root,0,.26,0,5,.50,M.darkStone,true);
  crystalShard(e.root,-1,0,3.1); crystalShard(e.root,1.1,.55,2.1);crystalShard(e.root,.1,-1,2.6);
  torus(e.root,0,.14,0,5.5,.09,M.crystal);
  selectionRing(e,6.4);
  return e;
}
function baseBuilding() {
  const e=newEntity('base','ally',-26,-10,{hp:920,damage:6,range:8,cooldown:2.7});
  art.building(e.root,'base');selectionRing(e,11);return e;
}
function createStructure(kind:BuildKind,x:number,z:number) {
  const def=BUILDINGS[kind];
  const defensive=['tower','castle','fortifiedChurch','guardTower','bomberTower'].includes(kind);
  const e=newEntity(kind,'ally',x,z,{hp:def.hp,damage:def.damage??(defensive?(kind==='castle'?40:23):0),range:def.range??(defensive?(kind==='castle'?19:17):0),cooldown:def.cooldown??1.5,sight:def.sight??20});
  renderStructureModel(e);
  return e;
}
function renderStructureModel(e:Entity){
  for(const child of [...e.root.getChildMeshes()])child.dispose();
  art.building(e.root,e.kind as BuildKind,!!e.gateOpen);
  selectionRing(e,e.kind==='castle'?8:e.kind==='farm'?7:6);
}
function createTroop(kind:TroopKind,x:number,z:number){
 const def=TROOPS[kind];
 const e=newEntity(kind,'ally',x,z,{hp:def.hp,speed:def.speed,damage:def.damage,range:def.range,cooldown:def.cooldown});
 shadow(e.root,def.naval?4:kind==='knight'||kind==='scout'?3.5:2.5);
 if(def.naval){
   const hull=ball(e.root,0,.6,0,1.6,M.bark,true);hull.scaling.set(1,.5,1.8);
   cylinder(e.root,0,2.6,0,.18,4,M.bark,true);box(e.root,.7,3.1,0,1.8,2,.1,kind==='warship'?M.heroBlue:M.linen,true);
 }else if(kind==='ram'||kind==='catapult'){
   box(e.root,0,1,0,2.4,1,3,M.bark,true);
   for(const x of [-1.2,1.2])for(const z of [-1,1])ball(e.root,x,.5,z,.5,M.darkStone,true);
   box(e.root,0,2,0,.3,2.5,.3,M.bark,true).rotation.x=kind==='catapult'?.7:1.57;
   if(kind==='ram')box(e.root,0,1.7,0,1,1,4,M.stone,true);
 }else if(kind==='knight'||kind==='scout'){
   box(e.root,0,1,0,1.4,1.3,2.6,M.bark,true);ball(e.root,0,1.7,1.3,.6,M.bark,true);
   for(const x of [-.5,.5])for(const z of [-.8,.8])box(e.root,x,.4,z,.2,.9,.2,M.darkStone,true);
   const rider=new TransformNode(e.id+'-rider',scene);rider.parent=e.root;rider.position.y=1;
   unitPart(rider,0,0,'guard');
   // All pickable descendants point at the entity root, including a mounted rider.
   for(const mesh of rider.getChildMeshes())mesh.metadata={entityId:e.id};
 }else{
   unitPart(e.root,0,0,kind==='monk'?'workers':'guard');
   if(kind==='archer'||kind==='crossbowman')torus(e.root,.7,1.3,.3,1.3,.1,M.bark,true).rotation.x=Math.PI/2;
   if(kind==='spearman')box(e.root,.8,1.9,0,.1,3,.1,M.linen,true);
   if(kind==='monk')box(e.root,.6,1.8,0,.1,2.8,.1,M.gold,true);
   if(kind==='champion'){e.root.scaling.setAll(1.2);ball(e.root,0,2.2,0,.3,M.gold,true);}
 }
 selectionRing(e,def.naval?4.5:3);
 return e;
}
function createRift() {
  const e=newEntity('rift','enemy',region.rift[0],region.rift[1],{hp:region.riftHP});
  cylinder(e.root,0,.45,0,10,1,M.darkStone,true);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;const rock=box(e.root,Math.cos(a)*4.4,.92,Math.sin(a)*4.4,1.8,1.65,1.8,M.enemyDark,true);rock.rotation.y=a;
  }
  cylinder(e.root,0,.10,0,8.8,.17,M.purpleFloor,true);
  const ring=torus(e.root,0,5,0,7.3,.58,M.rift,true);
  ring.rotation.x=Math.PI/2;
  e.visual=ring;
  const inner=torus(e.root,0,5.05,0,5.2,.16,M.riftCore,true);
  inner.rotation.x=Math.PI/2;
  const core=ball(e.root,0,5,0,1.5,M.riftCore,true);core.scaling.y=1.75;
  for(let i=0;i<5;i++){
    let a=i*2*Math.PI/5;const shard=cylinder(e.root,Math.cos(a)*2.2,5.1+Math.sin(a)*1.9,0,.5,2.3,M.riftCore,true,0);shard.rotation.z=a;
  }
  selectionRing(e,10.5);
  return e;
}
const ground=MeshBuilder.CreateGround('pickable terrain',{width:MAP_W,height:MAP_D,subdivisions:72,updatable:true},scene);
ground.material=M.earth;
ground.isPickable=true;
ground.receiveShadows=true;
ground.metadata={terrain:true};
// Procedural visual detail. Decorative meshes are never pickable, so RTS commands hit the ground beneath.
function decorateWorld() {
  art.terrain(ground,region);
  art.scatter(region);
  const avoid = (x:number,z:number) => Math.hypot(x+26,z+10)<12 || Math.hypot(x-region.rift[0],z-region.rift[1])<11 ||
    Math.hypot(x+31,z+23)<10 || Math.hypot(x+7,z-17)<9 || Math.hypot(x-3,z+24)<9 ||
    Math.abs(z-(-10+(x+26)*(region.rift[1]+10)/(region.rift[0]+26)))<4;
  for(let i=0;i<79;i++){
    const x=between(-43,43),z=between(-32,region.coastal?18:32);
    if(avoid(x,z))continue;
    tree(undefined,x,z,between(.65,1.4));
  }
  for(let i=0;i<43;i++){
    const x=between(-42,42),z=between(-31,region.coastal?18:31);
    if(avoid(x,z))continue;
    const rock=ball(undefined,x,.21,z,between(.35,.9),i%3?M.stone:M.darkStone);
    rock.scaling.y=.5;rock.rotation.z=rand();
  }
  // Ruined standing stones near the enemy stronghold.
  for(let i=0;i<7;i++){
    const a=i*Math.PI*2/7;
    const pillar=box(undefined,region.rift[0]+Math.cos(a)*9,1.9,Math.min(region.coastal?18:31,region.rift[1]+Math.sin(a)*8),1.8,between(2.2,4.0),1.8,M.darkStone);
    pillar.rotation.z=between(-.14,.14);
  }
}

const idsFor = (kind:Kind) => [...entities.values()].filter(e=>e.kind===kind);
const first = (kind:Kind) => idsFor(kind)[0];
const isHostileTo = (a:Entity,b:Entity) => (a.team==='ally' && b.team==='enemy') || (a.team==='enemy' && b.team==='ally');
function selected():Entity|undefined { return alive(selectedId); }
function feedback(message:string,tag='FIELD REPORT') {
  const outer=$('toast-container');
  const node=document.createElement('div');node.className='toast';
  const strong=document.createElement('strong');strong.textContent=tag;
  node.append(strong,document.createTextNode(' '+message));
  outer.appendChild(node);
  window.setTimeout(()=>{node.style.opacity='0';node.style.transition='opacity .3s';window.setTimeout(()=>node.remove(),320);},3400);
  while(outer.childElementCount>3)outer.firstElementChild?.remove();
}
const displayNames:Record<Kind,string>={
 vinnie:'Vinnie Jonas',rock:'STEIN',iron:'JERNMALM',clay:'LEIRE',herbs:'URTER',hero:'THE WARDEN',workers:'WORKERS',enemy:'CORRUPTED RAIDER',wood:'ANCIENT TIMBER',stone:'AETHER CRYSTALS',base:'TOWN HALL',rift:'CORRUPTION RIFT',
 ...Object.fromEntries(Object.entries(BUILDINGS).map(([k,d])=>[k,d.name.toUpperCase()])),
 ...Object.fromEntries(Object.entries(TROOPS).map(([k,d])=>[k,d.name.toUpperCase()]))
} as Record<Kind,string>;
const displayIcons:Record<Kind,string>={vinnie:'☏',rock:'⬡',iron:'⛏',clay:'▰',herbs:'✿',hero:'♞',workers:'⚒',enemy:'☠',wood:'▥',stone:'◆',base:'⌂',rift:'◈',
 ...Object.fromEntries(Object.entries(BUILDINGS).map(([k,d])=>[k,d.icon])),
 ...Object.fromEntries(Object.entries(TROOPS).map(([k,d])=>[k,d.icon]))
} as Record<Kind,string>;
function selectEntity(e:Entity|undefined) {
  if(!e)return;
  if(e.id!==selectedId && (buildMode||orderMode))cancelMode();
  selectedId=e.id; armySelected=false;
  for(const item of entities.values())if(item.selectionRing)item.selectionRing.isVisible=item.id===e.id;
  $('hero-card').classList.toggle('selected',e.kind==='hero');
  $('workers-card').classList.toggle('selected',e.kind==='workers');
  renderActions(); updateSelectedInfo();
}
function updateSelectedInfo() {
  const e=selected();if(!e)return;
  $('selection-icon').textContent=displayIcons[e.kind];
  $('selection-name').textContent=displayNames[e.kind];
  let extra='';
  if(e.kind==='hero')extra=`Frontline hero • ${Math.ceil(e.hp)}/${e.maxHp} HP`;
  else if(e.kind==='workers') extra=`Worker squad ×3 • ${Math.ceil(e.hp)}/${e.maxHp} HP`;
  else if(isResourceKind(e.kind))extra=`${Math.ceil(e.amount??0)} resources remaining`;
  else if(e.kind==='rift') extra=guardsTrained<2?'Shielded • recruit 2 guards':`${Math.ceil(e.hp)} / ${e.maxHp} HP`;
  else extra=`${Math.ceil(e.hp)} / ${e.maxHp} HP`;
  if(e.kind==='base')extra+=` · Rådhusnivå ${hallLevel}/3`;
  if(e.construction)extra+=` · Bygges ${Math.ceil(e.construction.remaining)}s`;
  if(e.upgrading)extra+=` · Oppgraderer ${Math.ceil(e.upgrading.remaining)}s`;
  if(e.researching)extra+=` · Forsker ${Math.ceil(e.researching.remaining)}s`;
  if(e.queue?.length)extra+=` · Kø ${e.queue.length}/5 · ${Math.ceil(e.queue[0].remaining)}s`;
  if(isTroopKind(e.kind))extra+=` · ${TROOPS[e.kind].role}`;
  if(isBuildingKind(e.kind)&&!e.construction)extra+=` · ${BUILDINGS[e.kind].description}`;
  $('queue-status').textContent=e.queue?.map((item,i)=>`${i+1}. ${TROOPS[item.kind].name} (${Math.ceil(item.remaining)}s)`).join(' | ')??'';
  const timer=e.construction??e.upgrading??e.researching??e.queue?.[0];
  $('production-progress').classList.toggle('hidden',!timer);
  $('production-fill').style.width=timer?`${100*(1-timer.remaining/timer.total)}%`:'0%';
  $('production-timer').textContent=timer?`${Math.ceil(timer.remaining)}s`:'';
  $('selection-desc').textContent=extra;
  $('selection-stats').innerHTML=isResourceKind(e.kind)?`<span>Innhold <b>${Math.ceil(e.amount??0)}</b></span>`:
    `<span>Nivå <b>${e.level}</b></span><span>HP <b>${Math.ceil(e.hp)}/${e.maxHp}</b></span><span>Skade <b>${e.damage}</b></span><span>Forsvar <b>${e.armor}</b></span><span>Fart <b>${e.speed.toFixed(1)}</b></span><span>Rekkevidde <b>${e.range.toFixed(1)}m</b></span><span>Angrep <b>${e.damage>0?e.cooldown.toFixed(1)+'s':'—'}</b></span><span>Sikt / varsling <b>${e.sight}m</b></span><span>Fraksjon <b>${e.team}</b></span>`;
  $('selected-hp-bar').style.width=isResourceKind(e.kind)?'100%':(e.hp/e.maxHp*100)+'%';
}
type Action = {icon:string;name:string;key:string;cost?:string;disabled?:boolean;fire:()=>void};
function formatCost(c:Cost){return `${c.wood} ▥ ${c.stone} ◆${c.food?` ${c.food} ♧`:''}${Object.entries(c.materials??{}).map(([k,n])=>` · ${n} ${materialName(k)}`).join('')}`;}
function renderActions(){
 const e=selected();const actions:Action[]=[];
 if(!e){$('action-group').replaceChildren();return;}
 if(e.construction){actions.push({icon:'✕',name:'Avbryt bygg',key:'',cost:'75% refusjon',fire:()=>cancelConstruction(e)});}
 else if(e.upgrading||e.researching){actions.push({icon:'◷',name:'Arbeider…',key:'',cost:'Se fremdrift',disabled:true,fire:()=>{}});}
 else if(e.kind==='vinnie'){actions.push({icon:'☏',name:'Snakk med Vinnie',key:'',fire:showVinnie});}
 else if(e.kind==='workers'){
   actions.push({icon:'▥',name:'Harvest',key:'G',fire:()=>setOrderMode('gather')});
   actions.push({icon:'⌂',name:'Byggemeny',key:'B',cost:'Alle bygninger',fire:showBuildMenu});
   actions.push({icon:'➤',name:'Move',key:'M',fire:()=>setOrderMode('move')});
 }else if(e.kind==='base'){
   if(hallLevel<3){const next=hallLevel+1;actions.push({icon:'↑',name:`Rådhus ${next}`,key:'',cost:formatCost(HALL_UPGRADES[next].cost),fire:upgradeHall});}
   actions.push({icon:'⌂',name:'Byggemeny',key:'B',fire:showBuildMenu});
 }else if(isBuildingKind(e.kind)){
   const def=BUILDINGS[e.kind];
   for(const kind of def.producer??[]){const d=TROOPS[kind];actions.push({icon:d.icon,name:d.name,key:kind==='guard'?'R':'',cost:formatCost(d.cost)+` · ${d.seconds}s`,disabled:(e.queue?.length??0)>=queueLimit,fire:()=>trainTroop(e,kind)});}
   if(def.upgrade){const target=def.upgrade;const d=BUILDINGS[target];actions.push({icon:'↑',name:d.name,key:'',cost:buildingLock(target,hallLevel,region.coastal)??formatCost(d.cost),disabled:!!buildingLock(target,hallLevel,region.coastal),fire:()=>upgradeBuilding(e,target)});}
   if(e.kind==='blacksmith'||e.kind==='university'){
     const key=e.kind==='blacksmith'?'arms':'logistics';const d=RESEARCH[key];actions.push({icon:'⌘',name:d.name,key:'',cost:research[key]?'Fullført':formatCost(d.cost),disabled:research[key],fire:()=>startResearch(e,key)});
   }
   if(e.kind==='market'){
     actions.push({icon:'◆',name:'Kjøp aether',key:'',cost:'100 ▥ → 60 ◆',fire:()=>trade('wood')});
     actions.push({icon:'▥',name:'Kjøp tømmer',key:'',cost:'100 ◆ → 60 ▥',fire:()=>trade('stone')});
   }
   if(e.kind==='kitchen')actions.push({icon:'♨',name:'Cooking',key:'',cost:'Tilbered feltrasjoner',fire:showProfessions});
   if(e.kind==='gate')actions.push({icon:'Π',name:e.gateOpen?'Lukk port':'Åpne port',key:'',fire:()=>toggleGate(e)});
   if(e.queue?.length)actions.push({icon:'✕',name:'Avbryt siste',key:'',cost:'Full refusjon',fire:()=>cancelTraining(e)});
 }else if(e.speed>0){
   if(e.kind==='hero')actions.push({icon:'✦',name:'Rally Cry',key:'Q',cost:rallyCooldown>0?`${Math.ceil(rallyCooldown)}s`:'BOOST ALLIES',fire:activateRally});
   if(e.damage>0)actions.push({icon:'⚔',name:'Attack',key:'A',fire:()=>setOrderMode('attack')});
   actions.push({icon:'➤',name:'Move',key:'M',fire:()=>setOrderMode('move')});
 }
 const group=$('action-group');group.replaceChildren();
 for(const a of actions){const b=document.createElement('button');b.className='action-button';b.disabled=!!a.disabled;b.title=a.cost?`${a.name}: ${a.cost}`:a.name;
 b.innerHTML=`<span class="action-glyph">${a.icon}</span><small>${a.name}</small><span class="action-key">${a.key}</span>${a.cost?`<span class="action-cost">${a.cost}</span>`:''}`;
 b.addEventListener('click',a.fire);group.appendChild(b);}
}
function showBuildMenu(){
 if(!gameStarted||gameEnded||!first('workers'))return;
 paused=true;
 openModal('BOSETNING · RÅDHUSNIVÅ '+hallLevel,'Velg en bygning',`<p>Plasser bygget innenfor bosetningsradiusen. Produksjon og forskning gjelder dette oppdraget.</p><div id="building-catalog" class="building-catalog"></div>`,[{label:'TILBAKE',run:closeModal}]);
 const catalog=$('building-catalog');
 for(const category of ['Economic','Research','Military','Defence']){
   const title=document.createElement('h3');title.textContent=category;catalog.appendChild(title);
   for(const [kind,def] of Object.entries(BUILDINGS) as [BuildKind,typeof BUILDINGS[BuildKind]][]){
     if(def.category!==category)continue;
     const locked=buildingLock(kind,hallLevel,region.coastal);const button=document.createElement('button');button.className='catalog-card';
     button.disabled=!!locked||!!def.upgradeOnly||!hasFunds(def.cost);
     button.innerHTML=`<strong>${def.icon} ${def.name}</strong><small>${def.description}</small><span>${def.upgradeOnly?'Oppgrader fra '+(kind==='harbor'?'Dock':'Monastery'):locked??formatCost(def.cost)+` · ${def.seconds}s${hasFunds(def.cost)?'':' · Mangler ressurser'}`}</span>`;
     button.addEventListener('click',()=>{closeModal();startBuilding(kind);});catalog.appendChild(button);
   }
 }
}
function setOrderMode(mode:OrderMode) {
  if(!selected() || !gameStarted || paused)return;
  cancelMode();orderMode=mode;
  $('cancel-command').classList.remove('hidden');
  $('mode-message').classList.remove('hidden');
  $('mode-message').textContent=mode==='gather'?'VELG TØMMER, AETHER, STEIN, JERN, LEIRE ELLER URTER':mode==='attack'?'SELECT A HOSTILE TARGET':'SELECT A DESTINATION';
  feedback(mode==='gather'?'Target a resource cluster.':mode==='attack'?'Target an enemy or the rift.':'Left-click a destination to move.','ORDER READY');
}
function cancelMode(){
  buildMode=null;orderMode=null;
  $('cancel-command').classList.add('hidden');
  $('mode-message').classList.add('hidden');
  placementMarker.isVisible=false;
  disposeBuildPreview();
}
function hasFunds(c:Cost){return canAfford({wood,stone,food,materials},c);}
function pay(c:Cost){wood-=c.wood;stone-=c.stone;food-=c.food??0;for(const [key,n] of Object.entries(c.materials??{}))materials[key]=(materials[key]??0)-n;}
function refund(c:Cost,factor=1){wood+=c.wood*factor;stone+=c.stone*factor;food+=(c.food??0)*factor;for(const [key,n] of Object.entries(c.materials??{}))materials[key]=(materials[key]??0)+n*factor;}
function ready(e:Entity){return !e.construction&&!e.upgrading;}
function isWater(x:number,z:number){return region.coastal&&z>=22;}
function placementProblem(kind:BuildKind,p:Vector3):string|null{
 const lock=buildingLock(kind,hallLevel,region.coastal);if(lock)return lock;
 if(BUILDINGS[kind].upgradeOnly)return 'Denne bygningen må oppgraderes fra forgjengeren.';
 const area=snapBuilding(kind,p.x,p.z,buildRotation);
 if(Math.abs(area.x)+area.width/2>40||Math.abs(area.z)+area.depth/2>30)return 'Hele bygget må være innenfor kartkanten.';
 if(footprintCells(area).some(([x,z])=>Math.hypot(x-basePos.x,z-basePos.z)>42))return 'Hele bygget må være innenfor bosetningsradiusen.';
 if(kind==='dock') {if(area.z<19.5||area.z>22)return 'Plasser Dock på strandlinjen (z 19.5–22).';}
 else if(kind==='fishTrap'){if(area.z-area.depth/2<22)return 'Hele Fish Trap må stå i vannet.';}
 else if(region.coastal&&area.z+area.depth/2>22)return 'Hele landbygget må stå på tørt land.';
 for(const e of entities.values()){
   const building=e.kind==='base'||e.kind==='rift'||isBuildingKind(e.kind);
   const resource=isResourceKind(e.kind);
   if(!building&&!resource&&e.kind!=='vinnie'&&e.speed<=0)continue;
   const [width,depth]=building?footprintSize(e.kind as BuildingKind|'base'|'rift',e.root.rotation.y):resource?[6,6]:e.kind==='workers'?[4,4]:[2,2];
   if(overlaps(area,{x:e.root.position.x,z:e.root.position.z,width,depth}))
    return building?'Rutenettet er opptatt av et bygg eller en byggeplass.':resource?'Rutenettet er opptatt av en ressurs.':'Flytt enheten som står i veien.';
 }
 const deposit=BUILDINGS[kind].deposit;
 if(deposit&&![...entities.values()].some(e=>e.kind===deposit&&(e.amount??0)>0&&Math.hypot(e.root.position.x-area.x,e.root.position.z-area.z)<=10))return 'Plasser innen 10m fra en passende ressursforekomst.';
 if(!hasFunds(costs[kind]))return 'Ikke nok ressurser til å bygge.';
 return null;
}
function startBuilding(kind:BuildKind){
 if(!gameStarted||paused||gameEnded)return;
 const workers=first('workers');if(!workers){feedback('Arbeiderne er ikke tilgjengelige.');return;}
 const lock=buildingLock(kind,hallLevel,region.coastal);if(lock){feedback(lock,'LÅST');return;}
 if(!hasFunds(costs[kind])){feedback(`Krever ${formatCost(costs[kind])}.`,'MANGLER RESSURSER');return;}
 cancelMode();selectEntity(workers);buildMode=kind;buildRotation=0;orderMode=null;
 $('cancel-command').classList.remove('hidden');$('mode-message').classList.remove('hidden');
 createBuildPreview(kind);
 updateBuildPreview(pickTerrain()??camera.target);
 feedback(BUILDINGS[kind].description,'BYGGING');
}
function tryPlaceBuilding(point:Vector3){
 if(!buildMode||!gameStarted||paused||gameEnded)return;
 const kind=buildMode,area=snapBuilding(kind,point.x,point.z,buildRotation);
 const problem=placementProblem(kind,point);
 if(problem){feedback(problem,'UGYLDIG PLASSERING');updateBuildPreview(point);return;}
 pay(costs[kind]);const e=createStructure(kind,area.x,area.z);e.root.rotation.y=buildRotation;
 e.construction={remaining:BUILDINGS[kind].seconds,total:BUILDINGS[kind].seconds};
 e.root.scaling.y=.35;feedback(`${BUILDINGS[kind].name} bygges.`, 'BYGGESTART');cancelMode();selectEntity(e);renderHUD();
}
function cancelConstruction(e:Entity){if(!e.construction||!isBuildingKind(e.kind))return;refund(costs[e.kind],.75);entities.delete(e.id);e.root.dispose(false,false);selectEntity(first('workers'));feedback('Bygging avbrutt. 75% refundert.');renderHUD();}
function troopCapacity(){return Math.min(armyLimit,8+4*[...entities.values()].filter(e=>e.kind==='house'&&ready(e)).length);}
function trainTroop(e:Entity,kind:TroopKind){
 if(!gameStarted||paused||gameEnded||!ready(e)||!isBuildingKind(e.kind))return;
 if(!BUILDINGS[e.kind].producer?.includes(kind))return;
 if((e.queue?.length??0)>=queueLimit){feedback('Produksjonskøen er full.');return;}
 const committed=[...entities.values()].filter(e=>e.team==='ally'&&isTroopKind(e.kind)).length+[...entities.values()].reduce((n,e)=>n+(e.queue?.length??0),0);
 if(committed>=troopCapacity()){feedback(`Boligplass ${troopCapacity()}/${armyLimit}. Bygg et House for 4 ekstra plasser.`);return;}
 const def=TROOPS[kind];if(!hasFunds(def.cost)){feedback(`Krever ${formatCost(def.cost)}.`,'MANGLER RESSURSER');return;}
 pay(def.cost);(e.queue??=[]).push({kind,remaining:def.seconds,total:def.seconds});feedback(`${def.name} lagt i kø.`,'REKRUTTERING');renderActions();renderHUD();
}
function cancelTraining(e:Entity){const item=e.queue?.pop();if(!item)return;refund(TROOPS[item.kind].cost);renderActions();renderHUD();}
function upgradeHall(){
 const e=first('base');if(!e||!ready(e)||hallLevel>=3||paused||gameEnded)return;
 const target=hallLevel+1;const def=HALL_UPGRADES[target];if(!hasFunds(def.cost)){feedback(`Krever ${formatCost(def.cost)}.`);return;}
 pay(def.cost);e.upgrading={target:target===2?'hall2':'hall3',remaining:def.seconds,total:def.seconds};renderActions();
}
function upgradeBuilding(e:Entity,target:BuildKind){
 if(!isBuildingKind(e.kind)||!ready(e)||e.researching||e.queue?.length||BUILDINGS[e.kind].upgrade!==target||paused||gameEnded){feedback('Tøm produksjonskøen før oppgradering.');return;}
 const lock=buildingLock(target,hallLevel,region.coastal);if(lock){feedback(lock);return;}
 const def=BUILDINGS[target];if(!hasFunds(def.cost)){feedback(`Krever ${formatCost(def.cost)}.`);return;}
 pay(def.cost);e.upgrading={target,remaining:def.seconds,total:def.seconds};renderActions();
}
function startResearch(e:Entity,key:keyof typeof RESEARCH){
 const def=RESEARCH[key];if(!ready(e)||e.kind!==def.building||research[key]||e.researching||paused||gameEnded)return;
 if([...entities.values()].some(item=>item.researching?.key===key)){feedback('Denne forskningen er allerede i gang.');return;}
 if(!hasFunds(def.cost)){feedback(`Krever ${formatCost(def.cost)}.`);return;}
 pay(def.cost);e.researching={key,remaining:def.seconds,total:def.seconds};renderActions();
}
function trade(resource:'wood'|'stone'){
 const e=selected();if(!e||e.kind!=='market'||!ready(e)||hallLevel<3||paused||gameEnded)return;
 if(resource==='wood'){if(wood<100){feedback('Krever 100 tømmer.');return;}wood-=100;stone+=60;}
 else{if(stone<100){feedback('Krever 100 aether.');return;}stone-=100;wood+=60;}
 renderHUD();feedback('Handel gjennomført.');
}
function updateProduction(dt:number){
 for(const e of [...entities.values()]){
  if(e.construction){e.construction.remaining-=dt;if(e.construction.remaining<=0){e.construction=undefined;e.root.scaling.y=1;if(e.kind==='sanctuary')healAllies(50);if(e.kind==='barracks')objectiveBarracks=true;if(e.kind==='brickWall')builtWalls++;if(e.kind==='brickWall'||e.kind==='gate')clearBarrierInterior(e);feedback(`${displayNames[e.kind]} ferdig.`,'BYGGING');renderActions();}continue;}
  if(e.upgrading){e.upgrading.remaining-=dt;if(e.upgrading.remaining<=0){const target=e.upgrading.target;e.upgrading=undefined;
   if(target==='hall2'||target==='hall3'){hallLevel=target==='hall2'?2:3;e.maxHp=920+(hallLevel-1)*350;e.hp=e.maxHp;e.root.scaling.setAll(1+(hallLevel-1)*.1);}
   else {e.kind=target;e.maxHp=BUILDINGS[target].hp;e.hp=e.maxHp;renderStructureModel(e);e.damage=target==='fortifiedChurch'?23:0;e.range=target==='fortifiedChurch'?17:0;e.cooldown=1.5;}
   feedback(`${displayNames[e.kind]} oppgradert.`,'UTVIKLING');renderActions();}continue;}
  if(e.researching){e.researching.remaining-=dt;if(e.researching.remaining<=0){research[e.researching.key]=true;feedback(`${RESEARCH[e.researching.key].name} fullført.`,'FORSKNING');e.researching=undefined;renderActions();}}
  const q=e.queue;if(!q?.length)continue;
  q[0].remaining-=dt;if(q[0].remaining>0)continue;
  const item=q[0],naval=TROOPS[item.kind].naval;
  let spawn:Vector3|undefined;
  // Search for valid terrain before completing; never charge or drop a blocked unit twice.
  for(let i=0;i<16;i++){const a=i*Math.PI/8;const p=v3(clamp(e.root.position.x+Math.sin(a)*5,-41,41),naval?25:clamp(e.root.position.z+Math.cos(a)*5,-29,region.coastal?20:29));
   if(isWater(p.x,p.z)!==!!naval)continue;
   if([...entities.values()].some(o=>(o.kind==='base'||isBuildingKind(o.kind))&&planarDistance(o.root.position,p)<4))continue;
   spawn=p;break;}
  if(!spawn){q[0].remaining=0;continue;}
  q.shift();createTroop(item.kind,spawn.x,spawn.z);if(item.kind==='guard')guardsTrained++;
  feedback(`${TROOPS[item.kind].name} klar.`,'FORSTERKNINGER');renderActions();renderHUD();
 }
}
function updateEconomy(dt:number){
 economyClock+=dt;if(economyClock<1)return;const seconds=economyClock;economyClock=0;
 const mill=[...entities.values()].some(e=>e.kind==='mill'&&ready(e));
 for(const e of entities.values()){
   if(!ready(e)||e.team!=='ally')continue;
   if(e.kind==='fishingBoat'&&isWater(e.root.position.x,e.root.position.z)){food+=2*seconds*(research.logistics?1.25:1);continue;}
   if(!isBuildingKind(e.kind))continue;
   const rate=economyRate(e.kind,mill,research.logistics);if(!rate)continue;
   const deposit=BUILDINGS[e.kind].deposit;
   if(deposit){const node=[...entities.values()].find(t=>t.kind===deposit&&(t.amount??0)>0&&planarDistance(t.root.position,e.root.position)<=10);if(!node)continue;
    const income=Math.min(node.amount!,rate*seconds);node.amount!-=income;
    creditGather(deposit,income,false);
    if(node.amount!<=0){entities.delete(node.id);node.root.dispose(false,false);}
   }else food+=rate*seconds;
 }
}
function activateRally(){
  if(!gameStarted||paused||gameEnded)return;
  if(rallyCooldown>0){feedback(`Rally Cry is recharging (${Math.ceil(rallyCooldown)}s).`,'ABILITY');return;}
  rallyCooldown=27;rallyActive=11;
  healAllies(33);
  feedback('Rally Cry! Allied fighters deal 50% more damage for 11 seconds and recover health.','HERO ABILITY');
  renderActions();
}
function healAllies(hp:number) {
  for(const e of entities.values())if(e.team==='ally')e.hp=Math.min(e.maxHp,e.hp+hp);
}
function moveToward(e:Entity,p:Vector3,dt:number,stopRadius=0):boolean {
  const naval=isTroopKind(e.kind)&&!!TROOPS[e.kind].naval;
  // Shoreline is impassable for land units and boats remain in the water band.
  p=p.clone();p.x=clamp(p.x,-42,42);p.z=clamp(p.z,naval?23:-30,naval?30:region.coastal?20:30);
  const dist=planarDistance(e.root.position,p);
  if(dist<=stopRadius+.07)return true;
  const step=Math.min(Math.max(0,dist-stopRadius),e.speed*dt);
  const dx=(p.x-e.root.position.x)/dist,dz=(p.z-e.root.position.z)/dist;
  let nx=clamp(e.root.position.x+dx*step,-43,43),nz=clamp(e.root.position.z+dz*step,-31,31);
  const blocker=!naval?[...entities.values()].find(t=>t.id!==e.id&&solidBarrier(t)&&crossesBarrier(e.root.position.x,e.root.position.z,nx,nz,barrierShape(t))):undefined;
  if(blocker){
    e.blockedBy=blocker.id;
    if(e.team==='enemy')return false;
    // Simple detour along the wall toward the nearer endpoint; closed walls remain solid.
    const a=blocker.root.rotation.y,c=Math.cos(a),sn=Math.sin(a),rx=e.root.position.x-blocker.root.position.x,rz=e.root.position.z-blocker.root.position.z;
    const localX=rx*c-rz*sn;const sign=localX===0?1:Math.sign(localX);
    nx=e.root.position.x+sign*c*step;nz=e.root.position.z-sign*sn*step;
    if([...entities.values()].some(t=>solidBarrier(t)&&crossesBarrier(e.root.position.x,e.root.position.z,nx,nz,barrierShape(t))))return false;
  }else e.blockedBy=undefined;
  e.root.position.x=clamp(nx,-43,43);e.root.position.z=clamp(nz,-31,31);
  // Turn the unit towards its destination; Babylon's forward axis is Z.
  e.root.rotation.y=Math.atan2(dx,dz);
  return planarDistance(e.root.position,p)<=stopRadius+.07;
}
function order(e:Entity,target:Entity|undefined,point:Vector3|undefined){
  if(e.speed<=0)return;
  if(point&&isWater(point.x,point.z)!==(isTroopKind(e.kind)&&!!TROOPS[e.kind].naval)&&!target){feedback('Denne enheten kan ikke bevege seg på valgt terreng.');return;}
  e.targetId=undefined;e.moveTarget=undefined;e.blockedBy=undefined;
  if(target){
    if(target.kind==='vinnie'&&e.kind==='hero'){e.targetId=target.id;}
    else if(isResourceKind(target.kind) && e.kind==='workers'){
      e.targetId=target.id;feedback(`Pathfinders harvesting ${displayNames[target.kind].toLowerCase()}.`,'GATHER ORDER');
    }else if(isHostileTo(e,target)&&e.damage>0){
      e.targetId=target.id;feedback(`Attack order: ${displayNames[target.kind]}.`,'COMBAT ORDER');
    }else if(point) {
      e.moveTarget=point.clone();feedback('Move order acknowledged.','MOVEMENT');
    }
  }else if(point){
    e.moveTarget=point.clone();feedback('Move order acknowledged.','MOVEMENT');
  }
  cancelMode();
}
function damage(target:Entity,amount:number,attacker?:Entity){
  if(target.kind==='rift'&&guardsTrained<2){
    if(gameTime-lastShieldToast>6){feedback('The rift is shielded. Construct a Barracks and train 2 Royal Guards.','SEALED RIFT');lastShieldToast=gameTime;}
    return;
  }
  if(attacker&&isTroopKind(attacker.kind)){if(research.arms)amount*=1.2;if(target.kind==='base'||target.kind==='rift'||isBuildingKind(target.kind))amount*=TROOPS[attacker.kind].structureBonus??1;}
  if(target.team==='neutral')return;
  target.hp=Math.max(0,target.hp-amount*mitigation(target.armor));
  if(attacker)spawnProjectile(attacker.root.position,target.root.position,attacker.range>5);
  if(target.hp<=0)destroyEntity(target);
}
function destroyEntity(e:Entity){
  if(!entities.has(e.id))return;
  const killedSelected=e.id===selectedId;
  const kind=e.kind;
  if(e.team==='ally'&&(isTroopKind(kind)||kind==='workers'))unitsLost++;
  entities.delete(e.id);e.root.dispose(false,false);
  if(killedSelected){selectedId=null;selectEntity(first('hero')??first('guard')??first('workers')??first('base'));}
  if(kind==='rift'){renderObjectives();checkVictory();return;}
  if(kind==='hero'||kind==='base'){loseGame(kind==='hero'?'The Warden has fallen.':'The Command Hearth has been destroyed.');return;}
  if(kind==='workers')feedback('Your Worker support unit has been defeated.','UNIT LOST');
  if(kind==='guard')feedback('A Royal Guard has fallen.','UNIT LOST');
  if(kind==='enemy')feedback('Corrupted raider defeated.','ENEMY DEFEATED');
}
function spawnProjectile(from:Vector3,to:Vector3,isRanged:boolean) {
  if(!isRanged && rand()>.35)return;
  const m=ball(undefined,from.x,2.3,from.z,.22,isRanged?M.goldGlow:M.white);
  m.position.set(from.x,2.3,from.z);m.isPickable=false;
  projectiles.push({mesh:m,from:v3(from.x,from.z,2.3),to:v3(to.x,to.z,1.35),age:0,duration:isRanged?.31:.15});
}
function updateProjectiles(dt:number) {
  for(let i=projectiles.length-1;i>=0;i--){
    const p=projectiles[i];p.age+=dt;
    const t=clamp(p.age/p.duration,0,1);
    Vector3.LerpToRef(p.from,p.to,t,p.mesh.position);
    p.mesh.position.y+=Math.sin(t*Math.PI)*1.4;
    if(t>=1){p.mesh.dispose();projectiles.splice(i,1);}
  }
}
function updateUnit(e:Entity,dt:number) {
  if(e.kind==='hero'&&alive(e.targetId)?.kind==='vinnie'){
    const npc=alive(e.targetId)!;if(moveToward(e,npc.root.position,dt,5)){e.targetId=undefined;showVinnie();}return;
  }
  e.attackClock=Math.max(0,e.attackClock-dt);
  if(isTroopKind(e.kind)&&TROOPS[e.kind].healer){
    const patient=[...entities.values()].filter(t=>t.team==='ally'&&t.hp<t.maxHp&&(t.kind==='hero'||isTroopKind(t.kind)||t.kind==='workers')&&planarDistance(t.root.position,e.root.position)<=TROOPS[e.kind as TroopKind].range).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
    if(patient&&e.attackClock<=0){patient.hp=Math.min(patient.maxHp,patient.hp+12);e.attackClock=2;}
  }
  if(e.kind==='workers' && e.targetId) {
    const target=alive(e.targetId);
    if(!target||!isResourceKind(target.kind)){e.targetId=undefined;return;}
    const near=moveToward(e,target.root.position,dt,4.2);
    if(near && (target.amount??0)>0) {
      const resource=target.kind as ResourceKind;
      const yieldAmount=Math.min(target.amount!,15*dt*gatherMultiplier(RESOURCE_DEFS[resource].profession,professions));
      target.amount!-=yieldAmount;
      creditGather(resource,yieldAmount,true);
      if(target.amount!<=0){
        feedback(`${displayNames[target.kind]} depleted.`,'HARVEST COMPLETE');
        entities.delete(target.id);target.root.dispose(false,false);
        e.targetId=undefined;
      }
    }
    return;
  }
  if(e.kind==='enemy'&&e.blockedBy){
    const wall=alive(e.blockedBy);
    if(wall&&solidBarrier(wall)){
      const distance=barrierDistance(e.root.position.x,e.root.position.z,barrierShape(wall));
      if(distance<=e.range&&e.attackClock<=0){e.attackClock=e.cooldown;damage(wall,e.damage,e);}return;
    }e.blockedBy=undefined;
  }
  if(e.kind==='enemy') {
    const current=alive(e.targetId);
    if(!current||current.team!=='ally')e.targetId=first('base')?.id;
  }
  let target=alive(e.targetId);
  if(e.targetId && !target)e.targetId=undefined;
  if(target && isHostileTo(e,target) && e.damage>0) {
    const dist=solidBarrier(target)?barrierDistance(e.root.position.x,e.root.position.z,barrierShape(target)):planarDistance(e.root.position,target.root.position);
    if(dist>e.range){moveToward(e,target.root.position,dt,e.range*.88);}
    else if(e.attackClock<=0){
      e.attackClock=e.cooldown;
      const boosted=e.team==='ally'&&rallyActive>0?1.5:1;
      damage(target,e.damage*boosted,e);
    }
    return;
  }
  if(e.moveTarget){
    if(moveToward(e,e.moveTarget,dt,.3))e.moveTarget=undefined;
    return;
  }
  if(isTroopKind(e.kind)&&!TROOPS[e.kind].naval && !e.targetId){
    const hero=first('hero');
    if(hero && planarDistance(e.root.position,hero.root.position)>11){
      moveToward(e,hero.root.position,dt,between(5,6));
    }
  }
}
function autoCombat(dt:number) {
  aiClock+=dt;
  if(aiClock<.60)return;
  aiClock=0;
  const list=[...entities.values()];
  for(const e of list){
    if(!ready(e)||!entities.has(e.id))continue;
    if(e.kind==='outpost'){
      e.alertClock=Math.max(0,(e.alertClock??0)-.6);
      if(e.alertClock<=0&&list.some(t=>t.team==='enemy'&&t.kind!=='rift'&&planarDistance(e.root.position,t.root.position)<=e.sight)){feedback('Outpost oppdager fiender i nærheten!','VARSEL');e.alertClock=20;}
    }
    if(e.team==='ally' && (e.kind==='hero'||isTroopKind(e.kind)&&e.damage>0)){
      if(e.targetId||e.moveTarget)continue;
      const nearest=list.filter(t=>t.team==='enemy'&&t.kind!=='rift')
        .sort((a,b)=>planarDistance(e.root.position,a.root.position)-planarDistance(e.root.position,b.root.position))[0];
      if(nearest && planarDistance(e.root.position,nearest.root.position)<Math.max(e.range+1,8.7))e.targetId=nearest.id;
    }
    if(e.kind==='enemy'){
      const nearby=list.filter(t=>t.team==='ally'&&t.hp>0)
        .sort((a,b)=>planarDistance(e.root.position,a.root.position)-planarDistance(e.root.position,b.root.position))[0];
      if(nearby&&planarDistance(e.root.position,nearby.root.position)<12)e.targetId=nearby.id;
    }
    if(e.speed===0&&e.team==='ally'&&e.damage>0){
      e.attackClock=Math.max(0,e.attackClock-.60);
      if(e.attackClock>0)continue;
      const nearest=list.filter(t=>t.kind==='enemy')
        .sort((a,b)=>planarDistance(e.root.position,a.root.position)-planarDistance(e.root.position,b.root.position))[0];
      if(nearest&&planarDistance(e.root.position,nearest.root.position)<e.range){
        e.attackClock=e.cooldown;
        if(e.kind==='bomberTower'){
          const impact=nearest.root.position.clone();
          for(const t of list)if(entities.has(t.id)&&t.team==='enemy'&&planarDistance(t.root.position,impact)<=4)damage(t,e.damage,e);
        }else damage(nearest,e.damage,e);
      }
    }
  }
}
function spawnWave(dt:number){
  if(!first('rift'))return;
  waveClock+=dt;
  if(waveClock<region.waveSeconds)return;
  waveClock=0;
  if(idsFor('enemy').length>=11)return;
  for(let i=0;i<region.waveSize;i++){
    const a=i*1.3+gameTime*.02;
    const e=createEnemy(clamp(riftPos.x+Math.cos(a)*6,-40,40),clamp(riftPos.z+Math.sin(a)*6,-29,region.coastal?19:29));
    e.targetId=first('base')?.id;
  }
  feedback('Corrupted raiders are advancing from the eastern rift.','ENEMY WAVE');
}
const placementMarker=box(undefined,0,.15,0,1,.2,1,material('place green','#7fe3ac','#2b9972',.40));
placementMarker.isPickable=false;placementMarker.isVisible=false;
let buildPreviewRoot:TransformNode|null=null,buildGrid:Mesh|null=null;
let buildPreviewPaints:StandardMaterial[]=[];
function disposeBuildPreview(){
 buildPreviewRoot?.dispose(false,false);buildPreviewRoot=null;
 buildGrid?.dispose();buildGrid=null;
 for(const paint of buildPreviewPaints)paint.dispose(false,false);
 buildPreviewPaints=[];
}
function createBuildPreview(kind:BuildKind){
 disposeBuildPreview();
 buildPreviewRoot=new TransformNode('building-preview',scene);
 const paints=new Map<StandardMaterial,StandardMaterial>();
 for(const mesh of art.building(buildPreviewRoot,kind)){
   mesh.isPickable=false;mesh.metadata={preview:true};
   const original=mesh.material as StandardMaterial;
   let paint=paints.get(original);
   if(!paint){
     paint=new StandardMaterial('preview/'+original.name,scene);
     paint.diffuseColor=original.diffuseColor.clone();paint.specularColor=original.specularColor.clone();
     // Share textures; material cloning would duplicate procedural textures on every preview.
     paint.diffuseTexture=original.diffuseTexture;paint.bumpTexture=original.bumpTexture;
     paint.alpha=.45;paint.disableDepthWrite=true;paints.set(original,paint);
   }
   mesh.material=paint;
 }
 buildPreviewPaints=[...paints.values()];
 const [width,depth]=footprintSize(kind);
 for(const [x,z] of footprintCells({x:0,z:0,width,depth})){
   const tile=box(buildPreviewRoot,x,.09,z,GRID_SIZE-.08,.04,GRID_SIZE-.08,material('preview cell clear','#7fe3ac','#2b9972',.25));
   tile.metadata={preview:true,previewCell:true};tile.isPickable=false;
 }
 const lines:Vector3[][]=[];
 for(let x=-40;x<=40;x+=GRID_SIZE)lines.push([v3(x,-30,.045),v3(x,30,.045)]);
 for(let z=-30;z<=30;z+=GRID_SIZE)lines.push([v3(-40,z,.045),v3(40,z,.045)]);
 const grid=MeshBuilder.CreateLineSystem('construction grid',{lines},scene);
 grid.color=tint('#a8cebb');grid.alpha=.25;grid.isPickable=false;buildGrid=grid;
}
function updateBuildPreview(point?:Vector3){
 if(!buildMode||!buildPreviewRoot)return;
 buildPreviewRoot.setEnabled(!!point);placementMarker.isVisible=!!point;
 if(!point){$('mode-message').textContent='Pek på kartet for å plassere · ESC / høyreklikk avbryt';return;}
 const area=snapBuilding(buildMode,point.x,point.z,buildRotation);
 buildPreviewRoot.position.set(area.x,0,area.z);buildPreviewRoot.rotation.y=buildRotation;
 const problem=placementProblem(buildMode,v3(area.x,area.z));
 const paint=problem?material('preview cell blocked','#e77e80','#9e3333',.40):material('preview cell clear','#7fe3ac','#2b9972',.25);
 for(const mesh of buildPreviewRoot.getChildMeshes())if(mesh.metadata?.previewCell)mesh.material=paint;
 for(const paint of buildPreviewPaints)paint.emissiveColor=problem?new Color3(.35,.03,.03):new Color3(.03,.12,.08);
 placementMarker.position.set(area.x,.065,area.z);placementMarker.scaling.set(area.width,.15,area.depth);placementMarker.rotation.y=0;placementMarker.material=paint;
 $('mode-message').textContent=`${BUILDINGS[buildMode].name} · ${area.width/GRID_SIZE} × ${area.depth/GRID_SIZE} ruter · ${problem??'Klikk for å bygge'} · R roter · ESC / høyreklikk avbryt`;
}
function animateWorld(dt:number){
  const rift=first('rift');
  if(rift?.visual){
    rift.visual.rotation.z+=dt*.32;
    rift.visual.position.y=5+Math.sin(gameTime*1.3)*.16;
  }
  const hero=first('hero');
  if(hero) {
    // Gentle anticipation in idle stance.
    const ring=hero.root.getChildMeshes().find(mesh=>mesh.name==='ring'&&mesh!==hero.selectionRing);
    if(ring)ring.scaling.setAll(1+Math.sin(gameTime*2.1)*.015);
  }
  updateProjectiles(dt);
}
function updateGame(dt:number){
  gameTime+=dt;
  updateProduction(dt);updateEconomy(dt);updateCrafting(dt);
  rallyCooldown=Math.max(0,rallyCooldown-dt);
  rallyActive=Math.max(0,rallyActive-dt);
  for(const e of [...entities.values()]){
    if(!entities.has(e.id))continue;
    if(e.speed>0)updateUnit(e,dt);
  }
  autoCombat(dt);
  spawnWave(dt);
  checkVictory();
  hudClock+=dt;minimapClock+=dt;
  if(hudClock>.25){hudClock=0;renderHUD();}
  if(minimapClock>.15){minimapClock=0;drawMinimap();}
}
function missionState(){
  return [
    {title:'Supply the expedition',detail:`Timber ${Math.floor(gatheredWood)}/80  ·  Aether ${Math.floor(gatheredStone)}/50`,done:gatheredWood>=80&&gatheredStone>=50},
    {title:'Establish a barracks',detail:'Construct a training hall',done:objectiveBarracks},
    {title:'Raise two Royal Guards',detail:`${Math.min(guardsTrained,2)}/2 guards recruited`,done:guardsTrained>=2},
    {title:'Destroy the Corruption Rift',detail:idsFor('rift').length===0?'Rift neutralized':guardsTrained<2?'Eastern sector · rift shield active':'Eastern sector · shield broken',done:idsFor('rift').length===0}
  ];
}
function renderObjectives() {
  const objectives=missionState();
  const completed=objectives.filter(o=>o.done).length;
  $('objective-number').textContent=`${completed} / 4 OBJECTIVES`;
  $('objective-percent').textContent=`${completed*25}%`;
  $('mission-progress-fill').style.width=(completed*25)+'%';
  $('objective-list').innerHTML=objectives.map((o,i)=>`<div class="objective-item ${o.done?'done':''}"><span class="objective-checkbox">${o.done?'✓':''}</span><span class="objective-copy"><strong>${String(i+1).padStart(2,'0')}. ${o.title}</strong><small>${o.detail}</small></span></div>`).join('');
}
function renderHUD() {
  $('wood-value').textContent=Math.floor(wood).toString();
  $('stone-value').textContent=Math.floor(stone).toString();
  $('army-value').textContent=String([...entities.values()].filter(e=>e.team==='ally'&&isTroopKind(e.kind)).length).padStart(2,'0');
  $('hero-hp').style.width=((first('hero')?.hp??0)/300*100)+'%';
  $('workers-hp').style.width=((first('workers')?.hp??0)/190*100)+'%';
  $('company-count').textContent=`${[...entities.values()].filter(e=>e.team==='ally'&&isTroopKind(e.kind)).length}/${troopCapacity()} TROOPS`;
  ($('hero-card') as HTMLButtonElement).disabled=!first('hero');
  ($('workers-card') as HTMLButtonElement).disabled=!first('workers');
  $('food-value').textContent=Math.floor(food).toString();
  $('hall-level').textContent=`RÅDHUS ${hallLevel}/3`;
  renderArmy();updateSelectedInfo();renderObjectives();renderJournalSummary();
  const npc=first('vinnie');$('vinnie-marker').classList.toggle('hidden',!npc||!gameStarted);
  if(npc&&gameStarted){const point=Vector3.Project(npc.root.position.add(new Vector3(0,4.3,0)),Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));
   $('vinnie-marker').style.left=(point.x*(canvas.clientWidth||engine.getRenderWidth())/engine.getRenderWidth())+'px';$('vinnie-marker').style.top=(point.y*(canvas.clientHeight||engine.getRenderHeight())/engine.getRenderHeight())+'px';$('vinnie-marker').classList.toggle('hidden',point.z<0||point.z>1);}

}
function checkVictory(){
  if(gameEnded)return;
  if(missionState().every(o=>o.done)){
    gameEnded=true;paused=true;
    try{const done=JSON.parse(localStorage.getItem('arise-regions-v1')||'[]');if(Array.isArray(done)&&!done.includes(region.id)){done.push(region.id);localStorage.setItem('arise-regions-v1',JSON.stringify(done));}}catch{/* Campaign remains playable if local storage is blocked. */}
    const actions=[{label:'SPILL REGIONEN IGJEN',run:()=>loadRegion(region.id,true)},{label:'REGIONKART',run:showRegions}];
    if(region.id<10)actions.unshift({label:'NESTE REGION',run:()=>loadRegion(region.id+1,true)});
    openModal('REGION SIKRET',region.name.toUpperCase(),
      `<p>Riften er ødelagt og alle fire mål er fullført.</p><p>Tid: ${Math.floor(gameTime/60)}m ${Math.floor(gameTime%60)}s · Tropper tapt: ${unitsLost}<br>Tømmer samlet: ${Math.floor(gatheredWood)} · Aether samlet: ${Math.floor(gatheredStone)}</p><p>Helten, hæren, bygninger og råvarer starter på nytt i neste region i denne versjonen.</p>`,actions);
  }
}
function loseGame(cause:string){
  if(gameEnded)return;
  gameEnded=true;paused=true;
  openModal('CAMPAIGN FAILED','THE FRONTIER HOLDS.',`<p>${cause}</p><p>Rebuild your strategy: harvest early, recruit reinforcements and use the Warden's Rally Cry to hold the line.</p>`,
    [{label:'PRØV REGIONEN IGJEN',run:()=>loadRegion(region.id,true)},{label:'REGIONKART',run:showRegions}]);
}
function openModal(kicker:string,title:string,content:string,actions:{label:string;secondary?:boolean;run:()=>void}[]){
  $('modal-kicker').textContent=kicker;$('modal-title').textContent=title;
  $('modal-content').innerHTML=content;
  const holder=$('modal-actions');holder.replaceChildren();
  for(const a of actions) {
    const b=document.createElement('button');b.textContent=a.label;
    if(a.secondary)b.className='secondary';
    b.addEventListener('click',a.run);holder.appendChild(b);
  }
  $('modal').classList.remove('hidden');
}
function closeModal(){
  $('modal').classList.add('hidden');
  if(gameStarted && !gameEnded)paused=false;
}
function showHelp(){
  const wasPlaying=gameStarted && !paused;
  if(wasPlaying)paused=true;
  openModal('FIELD MANUAL','Welcome to the frontier.',
    `<p>Your first mission introduces the four pillars of Arise: <strong>gather, build, recruit, conquer.</strong></p>
    <ul><li><strong>Select:</strong> left-click units or use <kbd>1</kbd> for the hero and <kbd>2</kbd> for the workers.</li>
    <li><strong>Command:</strong> right-click ground to move; right-click trees or crystals with workers selected to harvest; right-click enemies with soldiers selected to attack.</li>
    <li><strong>Construct:</strong> select workers and press <kbd>B</kbd> for the full building menu. Affordable buildings show a translucent model and their full reserved grid footprint. Green means clear; red explains a blocked placement. Left-click to place, R to rotate, Esc or right-click to cancel. No resources are spent until placement. Dock must stand on the northern shoreline; Fish Trap must stand in water. Upgrade the Town Hall to level 3 to unlock Market Place.</li>
    <li><strong>Recruit:</strong> select a military building to queue troops (maximum 5 per building; 8 troop spaces initially, +4 per completed House, maximum 40). Train two Royal Guards to break the rift shield. Build Farms for food and a Kitchen to prepare field rations. Select all troops with <kbd>3</kbd>.</li>
    <li><strong>Lead:</strong> select the Warden and press <kbd>Q</kbd> for Rally Cry. Use <kbd>W A S D</kbd> to pan, mouse wheel to zoom, <kbd>Space</kbd> to refocus, <kbd>P</kbd> to pause.</li></ul>
    <p>On touch devices, select a unit and use the action bar's <strong>Move</strong>, <strong>Attack</strong> or <strong>Harvest</strong> buttons, then tap the destination.</p>`,
    [{label:'UNDERSTOOD',run:closeModal}]);
}
function togglePause(){
  if(!gameStarted||gameEnded)return;
  if(!paused){
    paused=true;
    openModal('MISSION PAUSED','Your command awaits.',
      '<p>Oppdraget er pauset. Planlegg bygging, rekruttering og neste angrep.</p>',
      [{label:'RESUME COMMAND',run:closeModal},
      {label:'START REGIONEN PÅ NYTT',secondary:true,run:()=>loadRegion(region.id,true)},{label:'REGIONKART',secondary:true,run:showRegions}]);
  }else closeModal();
}
function beginCampaign(){
  $('modal').classList.add('hidden');
  $('home').classList.add('hidden');
  $('hud').classList.remove('hidden');
  gameStarted=true;paused=false;
  camera.target.set(-15,0,-6);camera.radius=62;
  selectEntity(first('hero'));renderHUD();drawMinimap();
  feedback(region.briefing,`REGION ${region.id}`);
  if(region.id===1)feedback('Ikke slå dere ned her! Dette er et farlig land. Snakk med meg før dere går videre.','VINNIE JONAS');
}
$('start-btn').addEventListener('click',showRegions);
$('how-btn').addEventListener('click',showHelp);
$('help-btn').addEventListener('click',showHelp);
$('pause-btn').addEventListener('click',togglePause);
$('cancel-command').addEventListener('click',cancelMode);
$('hero-card').addEventListener('click',()=>selectEntity(first('hero')));
$('workers-card').addEventListener('click',()=>selectEntity(first('workers')));

const minimap=$<HTMLCanvasElement>('minimap');
const minimapContext=minimap.getContext('2d');
function drawMinimap(){
  const ctx=minimapContext;if(!ctx)return;
  const w=minimap.width,h=minimap.height;
  const sx=(x:number)=>(x+MAP_W/2)/MAP_W*w;
  const sy=(z:number)=>(MAP_D/2-z)/MAP_D*h;
  ctx.fillStyle='#153a37';ctx.fillRect(0,0,w,h);
  // Foothills and woodland texture, deterministic to prevent flicker.
  for(let i=0;i<100;i++){
    const x=(i*113%97)/97*w,y=(i*37%93)/93*h;
    ctx.fillStyle=i%3?'#1e4b40':'#30554a';
    ctx.beginPath();ctx.arc(x,y,1.5+i%4,0,Math.PI*2);ctx.fill();
  }
  // Established overland path.
  ctx.strokeStyle='#8b85644a';ctx.lineWidth=7;ctx.lineCap='round';
  ctx.beginPath();
  for(let i=0;i<23;i++){
    const t=i/22,x=-23+t*53,z=-10+24*t+Math.sin(t*8)*2;
    if(i===0)ctx.moveTo(sx(x),sy(z));else ctx.lineTo(sx(x),sy(z));
  }ctx.stroke();
  // Control territories.
  ctx.strokeStyle='#87be9e45';ctx.lineWidth=1.2;
  ctx.beginPath();ctx.arc(sx(basePos.x),sy(basePos.z),34/MAP_W*w,0,Math.PI*2);ctx.stroke();
  for(const e of entities.values()) {
    let radius=3,fill='#91dfab';
    switch(e.kind){
      case'wood':radius=3;fill='#a6c97c';break;
      case'stone':radius=3.3;fill='#69dae8';break;
      case'enemy':radius=3.4;fill='#ec7a9a';break;
      case'rift':radius=6;fill='#c68aff';break;
      case'base':radius=5;fill='#e2cb89';break;
      case'barracks':case'tower':case'sanctuary':radius=4.4;fill='#e2cb89';break;
      case'hero':radius=4.4;fill='#f6e6b6';break;
      case'workers':radius=3.8;fill='#86ddad';break;
      case'guard':radius=3.3;fill='#96cadf';break;
    }
    if(isResourceKind(e.kind))fill=RESOURCE_DEFS[e.kind].color;
    if(e.kind==='vinnie'){fill='#ffe296';radius=5;}
    ctx.fillStyle=fill;
    ctx.beginPath();ctx.arc(sx(e.root.position.x),sy(e.root.position.z),radius,0,Math.PI*2);ctx.fill();
  }
  const visibleW=camera.radius*.61,visibleH=camera.radius*.42;
  ctx.strokeStyle='#f2ecda9b';ctx.lineWidth=1.4;
  ctx.strokeRect(sx(camera.target.x-visibleW/2),sy(camera.target.z+visibleH/2),visibleW/MAP_W*w,visibleH/MAP_D*h);
  ctx.strokeStyle='#638d80';ctx.lineWidth=2;ctx.strokeRect(1,1,w-2,h-2);
}
minimap.addEventListener('click',(ev)=>{
  if(!gameStarted||paused)return;
  const box=minimap.getBoundingClientRect();
  const nx=(ev.clientX-box.left)/box.width,ny=(ev.clientY-box.top)/box.height;
  camera.target.x=clamp(nx*MAP_W-MAP_W/2,-36,36);
  camera.target.z=clamp(MAP_D/2-ny*MAP_D,-27,27);
  drawMinimap();
});
type PointerStart={x:number;y:number;button:number;overGround:boolean;dragged:boolean};
let pointerStart:PointerStart|null=null;
function pickTerrain():Vector3|undefined {
  const hit=scene.pick(scene.pointerX,scene.pointerY,mesh=>mesh===ground);
  return hit?.hit&&hit.pickedPoint?hit.pickedPoint.clone():undefined;
}
function pickEntity():Entity|undefined {
  const result=scene.pick(scene.pointerX,scene.pointerY,mesh=>mesh.isPickable && mesh!==ground);
  const meta=result?.pickedMesh?.metadata as {entityId?:string}|undefined;
  return meta?.entityId?entities.get(meta.entityId):undefined;
}
scene.onPointerObservable.add((info)=>{
  const ev=info.event as PointerEvent;
  if(info.type===PointerEventTypes.POINTERDOWN){
    pointerStart={x:ev.clientX,y:ev.clientY,button:ev.button,overGround:!pickEntity(),dragged:false};
    return;
  }
  if(info.type===PointerEventTypes.POINTERMOVE){
    if(gameStarted){
      const hit=pickEntity();
      const tooltip=$('terrain-tooltip');
      if(hit&&(isResourceKind(hit.kind)||['enemy','rift','vinnie'].includes(hit.kind))){
        tooltip.textContent=`${displayNames[hit.kind]}  ·  ${isResourceKind(hit.kind)?Math.ceil(hit.amount??0)+' available':Math.ceil(hit.hp)+' HP'}`;
        tooltip.classList.remove('hidden');
        tooltip.style.left=(ev.clientX+8)+'px';tooltip.style.top=(ev.clientY-90)+'px';
      }else tooltip.classList.add('hidden');
    }
    if(buildMode)updateBuildPreview(pickTerrain());
    return;
  }
  if(info.type!==PointerEventTypes.POINTERUP || !pointerStart)return;
  const start=pointerStart;pointerStart=null;
  if(start.dragged || Math.hypot(ev.clientX-start.x,ev.clientY-start.y)>9)return;
  if(!gameStarted||paused||gameEnded)return;
  const point=pickTerrain(),target=pickEntity(),acting=selected();
  if(start.button===2){
    if(buildMode){cancelMode();return;}
    if(acting && acting.team==='ally'&&acting.speed>0)issueOrder(acting,target,point);
    return;
  }
  if(start.button!==0)return;
  if(buildMode){if(point)tryPlaceBuilding(point);return;}
  if(orderMode&&acting){
    if(orderMode==='move' && point){issueOrder(acting,undefined,point);return;}
    if(orderMode==='gather'&&target&&isResourceKind(target.kind)&&acting.kind==='workers'){issueOrder(acting,target,point);return;}
    if(orderMode==='attack'&&target&&isHostileTo(acting,target)&&acting.damage>0){issueOrder(acting,target,point);return;}
    feedback('Choose a valid target for the active command.','COMMAND');
    return;
  }
  // Touch-friendly shortcut: with workers selected, left-clicking a resource gathers it.
  if(target && acting?.kind==='workers'&&isResourceKind(target.kind)){issueOrder(acting,target,point);return;}
  if(target)selectEntity(target);
});
canvas.addEventListener('contextmenu',ev=>ev.preventDefault());
canvas.addEventListener('pointermove',ev=>{
  if(!pointerStart || !gameStarted || paused)return;
  const dist=Math.hypot(ev.clientX-pointerStart.x,ev.clientY-pointerStart.y);
  if(dist<6 && !pointerStart.dragged)return;
  if(pointerStart.button===1 || (pointerStart.button===0 && pointerStart.overGround && !buildMode)){
    pointerStart.dragged=true;
    const speed=camera.radius*.0057;
    camera.target.x=clamp(camera.target.x-ev.movementX*speed,-36,36);
    camera.target.z=clamp(camera.target.z+ev.movementY*speed,-27,27);
  }
});
canvas.addEventListener('wheel',ev=>{
  ev.preventDefault();
  camera.radius=clamp(camera.radius+(ev.deltaY>0?5:-5),28,92);
},{passive:false});
window.addEventListener('keydown',(ev)=>{
  if(ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement)return;
  const key=ev.key.toLowerCase();
  if(key==='escape'){
    if(!$('modal').classList.contains('hidden')&&!gameEnded){closeModal();return;}
    cancelMode();return;
  }
  if(key==='p'&&gameStarted){togglePause();return;}
  if(!gameStarted||paused||gameEnded)return;
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))ev.preventDefault();
  if(key==='1')selectEntity(first('hero'));
  if(key==='2')selectEntity(first('workers'));
  if(key==='q'&&selected()?.kind==='hero')activateRally();
  if(key==='r'&&buildMode){buildRotation=(buildRotation+Math.PI/2)%(2*Math.PI);updateBuildPreview(pickTerrain()??buildPreviewRoot?.position);return;}
  if(key==='b'&&(selected()?.kind==='workers'||selected()?.kind==='base'))showBuildMenu();
  if(key==='t'&&selected()?.kind==='workers')startBuilding('tower');
  if(key==='y'&&selected()?.kind==='workers')startBuilding('sanctuary');
  if(key==='g'&&selected()?.kind==='workers')setOrderMode('gather');
  if(key==='r'&&selected()?.kind==='barracks')trainTroop(selected()!,'guard');
  if(key==='3')selectArmy();
  if(key==='a'&&selected()?.damage)setOrderMode('attack');
  if(key==='m'&&selected()?.speed)setOrderMode('move');
  if(key===' '){
    const hero=first('hero');if(hero)camera.target.copyFrom(hero.root.position);
  }
});
let wasdTime=0;
function keyboardPan(dt:number){
  // Polling key state enables smooth RTS-style edge-independent camera motion.
  wasdTime+=dt;
  const amount=23*dt;
  if(keydown.has('w')||keydown.has('arrowup'))camera.target.z+=amount;
  if(keydown.has('s')||keydown.has('arrowdown'))camera.target.z-=amount;
  if(keydown.has('a')||keydown.has('arrowleft'))camera.target.x-=amount;
  if(keydown.has('d')||keydown.has('arrowright'))camera.target.x+=amount;
  camera.target.x=clamp(camera.target.x,-36,36);
  camera.target.z=clamp(camera.target.z,-27,27);
}
const keydown=new Set<string>();
window.addEventListener('keydown',e=>keydown.add(e.key.toLowerCase()));
window.addEventListener('keyup',e=>keydown.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>keydown.clear());
function renderArmy(){
 const list=$('army-roster');
 const troops=[...entities.values()].filter(e=>e.team==='ally'&&isTroopKind(e.kind));
 // Reconcile in place so live health updates do not remove keyboard focus.
 const existing=new Map([...list.children].map(el=>[(el as HTMLElement).dataset.entity!,el as HTMLButtonElement]));
 for(const e of troops){let button=existing.get(e.id);if(!button){button=document.createElement('button');button.dataset.entity=e.id;button.className='roster-unit';button.addEventListener('click',()=>selectEntity(alive(e.id)));list.appendChild(button);}
 button.textContent=`${displayIcons[e.kind]} ${displayNames[e.kind]} · ${Math.ceil(e.hp)} HP`;button.classList.toggle('selected',armySelected||selectedId===e.id);existing.delete(e.id);}
 for(const stale of existing.values())stale.remove();
}
function selectArmy(){
 const fighters=[...entities.values()].filter(e=>e.team==='ally'&&(e.kind==='hero'||isTroopKind(e.kind)&&e.kind!=='fishingBoat'));
 if(!fighters.length)return;selectEntity(fighters[0]);armySelected=true;
 for(const e of fighters)if(e.selectionRing)e.selectionRing.isVisible=true;
 renderArmy();feedback(`${fighters.length} enheter valgt. Høyreklikk for felles ordre.`,'HÆR');
}
function issueOrder(actor:Entity,target:Entity|undefined,point:Vector3|undefined){
 if(!armySelected){order(actor,target,point);return;}
 const troops=[...entities.values()].filter(e=>e.team==='ally'&&(e.kind==='hero'||isTroopKind(e.kind)&&e.kind!=='fishingBoat'));
 troops.forEach((e,i)=>{let goal=point?.clone();if(goal&&!target){goal.x+=((i%4)-1.5)*1.6;goal.z+=(Math.floor(i/4)%4)*1.6;}order(e,target,goal);});
}
function showRegions(){
 if(gameStarted)paused=true;
 let done:number[]=[];try{const raw=JSON.parse(localStorage.getItem('arise-regions-v1')||'[]');if(Array.isArray(raw))done=raw.filter(x=>typeof x==='number');}catch{/* optional progress only */}
 openModal('ARISE · 10 REGIONER','Velg en ekspedisjon',`<p>Alle ti kart kan spilles direkte. Hvert kart har eget terreng, ressursoppsett og fiendepress. Kystkart har fiske og sjøenheter. Dette er en utvidet prototype med felles hovedmål.</p><div id="region-catalog" class="region-catalog"></div>`,[{label:gameStarted&&!gameEnded?'TILBAKE TIL OPPDRAG':'LUKK',run:closeModal}]);
 for(const r of REGIONS){const b=document.createElement('button');b.className='region-card';b.innerHTML=`<span>REGION ${String(r.id).padStart(2,'0')} ${done.includes(r.id)?'· ✓ SIKRET':''}</span><strong>${r.name}</strong><small>${r.biome} · ${r.coastal?'Kyst og sjøenheter':'Innland'}</small><small>${r.briefing}</small>`;b.addEventListener('click',()=>loadRegion(r.id,true));$('region-catalog').appendChild(b);}
}
function loadRegion(id:number,start:boolean){
 const found=REGIONS.find(r=>r.id===id);if(!found)return;
 cancelMode();
 region=found;seed=region.seed;gameStarted=false;paused=false;gameEnded=false;
 for(const e of entities.values())e.root.dispose(false,false);entities.clear();
 for(const p of projectiles)p.mesh.dispose();projectiles.length=0;
 for(const mesh of [...scene.meshes])if(mesh!==ground&&mesh!==placementMarker)mesh.dispose();
 wood=90;stone=65;food=100;gatheredWood=0;gatheredStone=0;guardsTrained=0;hallLevel=1;
 gameTime=0;waveClock=0;hudClock=0;minimapClock=0;aiClock=0;rallyCooldown=0;rallyActive=0;economyClock=0;lastShieldToast=-100;
 materials={};professions=newProfessionState();quests=newQuestState();gathered={};crafted={};builtWalls=0;activeCraft=null;buildRotation=0;
 research={arms:false,logistics:false};objectiveBarracks=false;unitsLost=0;selectedId=null;armySelected=false;
 riftPos.set(region.rift[0],0,region.rift[1]);M.earth.diffuseColor=tint(region.terrain);M.leaf.diffuseColor=tint(region.foliage);M.leaf2.diffuseColor=tint(region.foliage).scale(1.15);scene.fogColor=tint(region.fog);scene.clearColor=new Color4(scene.fogColor.r,scene.fogColor.g,scene.fogColor.b,1);
 sky.intensity=region.id===6?.7:1.2;sun.intensity=region.id===6?.6:1.55;
 cancelMode();decorateWorld();
 if(region.coastal){const water=MeshBuilder.CreateGround('coastal water',{width:MAP_W,height:12},scene);water.position.set(0,.16,28);water.material=material('water','#407c86','#102a34',.9);water.isPickable=false;
  for(let i=-40;i<=40;i+=8){const foam=box(undefined,i,.2,22,4,.05,.2,M.linen);foam.isPickable=false;}}
 baseBuilding();createHero();createWorkers();createRift();
 for(const [x,z] of region.wood)createWood(x,z);for(const [x,z] of region.aether)createStone(x,z);
 spawnNewResources();if(region.id===1)createVinnie();
 for(const [x,z] of region.enemies){const enemy=createEnemy(x,z);enemy.maxHp=enemy.hp=85+(region.id-1)*7;}
 $('modal').classList.add('hidden');$('terrain-tooltip').classList.add('hidden');$('toast-container').replaceChildren();
 document.querySelector('.level-name')!.textContent=`${String(region.id).padStart(2,'0')} · ${region.name}`;
 document.querySelector('.right-panel h3')!.textContent=region.name;
 document.querySelector('.right-panel .panel-index')!.textContent=`${String(region.id).padStart(2,'0')} / 10`;
 document.querySelector('.mission-copy')!.textContent=region.briefing;
 document.querySelector('.minimap-caption')!.textContent=region.name.toUpperCase();
 selectEntity(first('hero'));renderHUD();drawMinimap();
 camera.target.set(-15,0,-6);camera.radius=62;
 if(start)beginCampaign();
}

function materialName(key:string){return (RESOURCE_DEFS as Record<string,{name:string}>)[key]?.name??(ITEM_NAMES as Record<string,string>)[key]??key;}
function creditGather(kind:ResourceKind,amount:number,manual=false){
 if(kind==='wood'){wood+=amount;gatheredWood+=amount;}else if(kind==='stone'){stone+=amount;gatheredStone+=amount;}else materials[kind]=(materials[kind]??0)+amount;
 gathered[kind]=(gathered[kind]??0)+amount;
 if(manual)professions[RESOURCE_DEFS[kind].profession]+=amount/5;
}
function createRawResource(kind:ResourceKind,x:number,z:number,amount=180){
 const e=newEntity(kind,'neutral',x,z,{hp:1,amount});const mat=material('raw-'+kind,RESOURCE_DEFS[kind].color);
 if(kind==='herbs'){
   for(let i=0;i<5;i++){const a=i*Math.PI*.4;cylinder(e.root,Math.cos(a),.7,Math.sin(a),.15,1.4,M.leaf,true);ball(e.root,Math.cos(a),1.5,Math.sin(a),.4,mat,true);}
 }else{
   for(let i=0;i<4;i++){const a=i*Math.PI/2;const stone=ball(e.root,Math.cos(a),.6,Math.sin(a),.8,mat,true);stone.scaling.y=kind==='clay'?.4:1;}
 }
 torus(e.root,0,.1,0,4,.07,mat);selectionRing(e,4.5);return e;
}
function spawnNewResources(){
 const points:[ResourceKind,number,number][]=[['clay',-23,8],['rock',-17,12],['iron',-3,-9],['herbs',-30,-22],['clay',16,-8],['rock',16,20],['iron',4,17],['herbs',-16,3]];
 for(const [kind,x,z] of points){const shift=region.id===1?0:(region.id%3-1)*1.3;createRawResource(kind,x+shift,Math.min(z,region.coastal?17:29),kind==='herbs'?100:200);}
}
function createVinnie(){
 const e=newEntity('vinnie','neutral',-17,-9,{hp:120,armor:2,speed:0,damage:0,range:0,cooldown:0,sight:12});
 unitPart(e.root,0,0,'workers');cylinder(e.root,0,2.1,0,1.4,.25,M.linen,true);
 torus(e.root,0,3.5,0,1,.1,M.goldGlow).rotation.x=Math.PI/2;selectionRing(e,3);return e;
}
function solidBarrier(e:Entity){return (e.kind==='brickWall'||e.kind==='gate'&&!e.gateOpen)&&!e.construction;}
function barrierShape(e:Entity):Barrier{return {x:e.root.position.x,z:e.root.position.z,rotation:e.root.rotation.y,halfWidth:4,halfDepth:.7};}
function clearBarrierInterior(e:Entity){
 const a=e.root.rotation.y,c=Math.cos(a),sn=Math.sin(a);
 for(const unit of entities.values())if(unit.speed>0&&barrierDistance(unit.root.position.x,unit.root.position.z,barrierShape(e))<.6){
   const dx=unit.root.position.x-e.root.position.x,dz=unit.root.position.z-e.root.position.z;
   const x=dx*c-dz*sn,z=(dx*sn+dz*c)>=0?1.5:-1.5;
   unit.root.position.x=e.root.position.x+x*c+z*sn;unit.root.position.z=e.root.position.z-x*sn+z*c;
 }
}
function toggleGate(e:Entity){
 if(e.kind!=='gate'||!ready(e)||!gameStarted||gameEnded||paused)return;
 if(e.gateOpen&&[...entities.values()].some(t=>t.speed>0&&barrierDistance(t.root.position.x,t.root.position.z,barrierShape(e))<.6)){feedback('En enhet står i portåpningen. Flytt den før porten lukkes.');return;}
 e.gateOpen=!e.gateOpen;renderStructureModel(e);if(e.selectionRing)e.selectionRing.isVisible=e.id===selectedId;
 renderActions();feedback(e.gateOpen?'Porten er åpen for alle, også fiender.':'Porten er lukket.','PORT');
}
function stations(){return [...entities.values()].filter(e=>isBuildingKind(e.kind)&&ready(e)).map(e=>e.kind as BuildingKind);}
function startCraft(recipeId:string){
 const recipe=RECIPES[recipeId];if(!recipe||!gameStarted||gameEnded)return false;
 if(activeCraft){feedback('Fullfør eller avbryt det aktive håndverksarbeidet først.');return false;}
 const lock=recipeLock(recipe,professions,stations());if(lock){feedback(lock);return false;}
 if(!hasFunds(recipe.cost)){feedback('Mangler ingredienser: '+formatCost(recipe.cost));return false;}
 const station=recipe.station?[...entities.values()].find(e=>e.kind===recipe.station&&ready(e)):undefined;
 pay(recipe.cost);activeCraft={recipeId,remaining:recipe.seconds,total:recipe.seconds,stationId:station?.id};
 feedback(recipe.name+' er startet.','HÅNDVERK');return true;
}
function cancelCraft(){if(!activeCraft)return;refund(RECIPES[activeCraft.recipeId].cost,.75);activeCraft=null;feedback('Håndverk avbrutt. 75% av ingrediensene refundert.');}
function updateCrafting(dt:number){
 if(!activeCraft)return;
 if(activeCraft.stationId){const station=alive(activeCraft.stationId);if(!station||!ready(station)){cancelCraft();return;}}
 activeCraft.remaining-=dt;if(activeCraft.remaining>0)return;
 const recipe=RECIPES[activeCraft.recipeId];materials[recipe.output]=(materials[recipe.output]??0)+recipe.count;crafted[recipe.output]=(crafted[recipe.output]??0)+recipe.count;professions[recipe.profession]+=recipe.xp;activeCraft=null;
 feedback(`${recipe.count} ${ITEM_NAMES[recipe.output]} ferdig. +${recipe.xp} profesjons-XP.`, 'HÅNDVERK');
}
function useCraftedItem(item:ItemKind){
 if(!gameStarted||gameEnded||(materials[item]??0)<1)return false;
 const e=selected();
 if(item==='fieldRations'){materials[item]--;food+=40;feedback('Feltrasjoner brukt: +40 mat.');return true;}
 if(!e||e.team!=='ally'||!(e.kind==='hero'||e.kind==='workers'||isTroopKind(e.kind))){feedback('Velg en alliert enhet på kartet før du bruker gjenstanden.');return false;}
 if(item==='salve'){
   if(e.hp>=e.maxHp){feedback('Enheten har allerede full helse.');return false;}e.hp=Math.min(e.maxHp,e.hp+80);
 }else if(item==='weaponKit'){
   if(e.damage<=0||e.weaponEquipped){feedback('Krever en kampklar enhet uten våpensett.');return false;}e.damage+=4;e.weaponEquipped=true;
 }else if(item==='armorKit'){
   if(e.kind==='workers'||e.armorEquipped){feedback('Krever helt eller militærtropp uten rustningssett.');return false;}e.armor+=5;e.armorEquipped=true;
 }else return false;
 materials[item]--;renderHUD();feedback(`${ITEM_NAMES[item]} brukt på ${displayNames[e.kind]}.`);return true;
}
function showProfessions(){
 if(!gameStarted||gameEnded)return;paused=true;
 const rows=(Object.entries(PROFESSIONS) as [Profession,typeof PROFESSIONS[Profession]][]).map(([key,p])=>{
  const level=professionLevel(professions[key]),next=XP_THRESHOLDS[level];return `<article><strong>${p.name} · Nivå ${level}/5</strong><small>${p.description}</small><span>${Math.floor(professions[key])} XP${next?' / '+next+' til neste nivå':' · Maksnivå'}</span></article>`;
 }).join('');
 const bag=Object.entries(materials).filter(([,n])=>n>0).map(([k,n])=>`${materialName(k)}: ${Math.floor(n)}`).join(' · ')||'Ingen materialer ennå. Send arbeiderne til ressurser på kartet.';
 openModal('PROFESJONER OG SEKK','Fra råvare til utstyr',`<p>Alle seks profesjoner er tilgjengelige. Arbeiderinnsamling gir 1 XP per 5 råvarer. Oppskrifter gir egen XP. Tid går videre når menyen lukkes. Fremgang gjelder dette oppdraget.</p><p class="bag-summary">${bag}</p><div class="profession-grid">${rows}</div><h3>Oppskrifter</h3><div id="recipe-catalog" class="building-catalog"></div><h3>Bruk gjenstander på valgt enhet</h3><p>${selected()?displayNames[selected()!.kind]:'Ingen valgt enhet'}. Lukk menyen for å velge en annen enhet.</p><div id="item-actions" class="item-actions"></div>`,[{label:'TILBAKE',run:closeModal},...(activeCraft?[{label:'AVBRYT HÅNDVERK · 75% REFUSJON',run:()=>{cancelCraft();showProfessions();}}]:[])]);
 for(const [id,recipe] of Object.entries(RECIPES)){
   const lock=recipeLock(recipe,professions,stations());const b=document.createElement('button');b.className='catalog-card';b.disabled=!!lock||!!activeCraft||!hasFunds(recipe.cost);
   b.innerHTML=`<strong>${recipe.name}</strong><small>${recipe.description}</small><span>${lock??formatCost(recipe.cost)+` · ${recipe.seconds}s · +${recipe.xp} XP`}</span><small>${PROFESSIONS[recipe.profession].name} nivå ${recipe.level}${activeCraft?' · Håndverk pågår':''}</small>`;
   b.addEventListener('click',()=>{if(startCraft(id))closeModal();});$('recipe-catalog').appendChild(b);
 }
 for(const item of ['salve','fieldRations','weaponKit','armorKit'] as ItemKind[]){const b=document.createElement('button');b.textContent=`${ITEM_NAMES[item]} (${Math.floor(materials[item]??0)})`;b.disabled=(materials[item]??0)<1;b.addEventListener('click',()=>{useCraftedItem(item);showProfessions();});$('item-actions').appendChild(b);}
}
function nearVinnie(){const hero=first('hero'),npc=first('vinnie');return region.id===1&&!!hero&&!!npc&&planarDistance(hero.root.position,npc.root.position)<=7;}
function acceptQuest(key:QuestKey){
 if(!nearVinnie()||quests[key].status!=='available'||gameEnded)return false;
 quests[key]={status:'active',baseline:{...gathered,brick:crafted.brick??0,salve:crafted.salve??0,walls:builtWalls}};
 feedback(QUESTS[key].title+' tatt. Se oppdragsjournalen.','OPPDRAG');return true;
}
function questProgress(key:QuestKey){
 const q=quests[key],delta=(k:string)=>(gathered[k]??0)-(q.baseline[k]??0);
 if(key==='defences'){
  const bricks=(crafted.brick??0)-(q.baseline.brick??0),walls=builtWalls-(q.baseline.walls??0);
  const ready=delta('clay')>=20&&delta('rock')>=15&&bricks>=5&&walls>=1&&[...entities.values()].some(e=>e.kind==='brickWall'&&readyEntity(e));
  return {ready,detail:`Leire ${Math.floor(Math.max(0,delta('clay')))}/20 · Stein ${Math.floor(Math.max(0,delta('rock')))}/15 · Lagde murstein ${Math.max(0,bricks)}/5 · Mur ${Math.max(0,walls)}/1`};
 }
 const count=(crafted.salve??0)-(q.baseline.salve??0);return {ready:delta('herbs')>=12&&count>=3&&(materials.salve??0)>=3,detail:`Urter ${Math.floor(Math.max(0,delta('herbs')))}/12 · Lagde salver ${Math.max(0,count)}/3 · Salver i sekken ${Math.floor(materials.salve??0)}/3`};
}
function readyEntity(e:Entity){return ready(e);}
function turnInQuest(key:QuestKey){
 if(!nearVinnie()||quests[key].status!=='active'||!questProgress(key).ready||gameEnded)return false;
 quests[key].status='completed';
 if(key==='defences'){wood+=80;food+=40;professions.masonry+=25;}else{materials.salve-=3;stone+=40;food+=60;professions.alchemy+=20;}
 feedback(QUESTS[key].reward,'OPPDRAG FULLFØRT');renderHUD();return true;
}
function questHtml(key:QuestKey){const q=quests[key],def=QUESTS[key];return `<article class="quest-card"><h3>${def.title}</h3><p>${def.description}</p><p>${q.status==='completed'?'✓ Fullført':q.status==='available'?'Snakk med Vinnie Jonas for å ta oppdraget.':questProgress(key).detail}</p><small>Belønning: ${def.reward}</small></article>`;}
function showVinnie(){
 if(!nearVinnie()){feedback('Flytt helten innen 7m fra Vinnie Jonas. Høyreklikk ham med helten valgt.');return;}if(gameEnded)return;
 paused=true;
 const actions:{label:string;run:()=>void}[]=[{label:'TILBAKE',run:closeModal}];
 for(const key of Object.keys(QUESTS) as QuestKey[]){if(quests[key].status==='available')actions.push({label:'TA: '+QUESTS[key].title,run:()=>{acceptQuest(key);showVinnie();}});
 else if(quests[key].status==='active'&&questProgress(key).ready)actions.push({label:'LEVER: '+QUESTS[key].title,run:()=>{turnInQuest(key);showVinnie();}});}
 openModal('BOSATT · NIVÅ 1','Vinnie Jonas',`<p class="npc-dialogue">«Ikke slå dere ned her. Dette er et farlig land, fullt av farer. Om natten kommer de fra riften, og ingen mur varer evig. Hvis dere blir, må dere forberede dere.»</p><p>Vinnie har to valgfrie oppdrag. Helten må være her både ved oppdragsstart og levering.</p>${(Object.keys(QUESTS) as QuestKey[]).map(questHtml).join('')}`,actions);
}
function showJournal(){
 if(!gameStarted||gameEnded)return;paused=true;
 openModal('OPPDRAGSJOURNAL','Ekspedisjonens oppdrag',region.id===1?(Object.keys(QUESTS) as QuestKey[]).map(questHtml).join(''):'<p>Vinnies to sideoppdrag finnes på kart 1. Hovedmålene vises i panelet på høyre side.</p>',[{label:'TILBAKE',run:closeModal}]);
}
function renderJournalSummary(){
 const active=(Object.keys(QUESTS) as QuestKey[]).filter(k=>quests[k].status==='active');
 $('sidequest-summary').textContent=region.id===1?active.length?active.map(k=>QUESTS[k].title+': '+(questProgress(k).ready?'Klar til levering':questProgress(k).detail)).join(' | '):(Object.values(quests).every(q=>q.status==='completed')?'Begge sideoppdrag er fullført.':'Vinnie Jonas venter ved bosetningen. Snakk med ham for valgfrie oppdrag.'):'';
 $('craft-status').textContent=activeCraft?`${RECIPES[activeCraft.recipeId].name} · ${Math.ceil(activeCraft.remaining)}s`:'Håndverk: ingen aktiv produksjon';
 $('materials-summary').textContent=['rock','iron','clay','herbs','brick','ironBar'].map(k=>`${materialName(k)} ${Math.floor(materials[k]??0)}`).join(' · ');
}

$('vinnie-marker').addEventListener('click',()=>{selectEntity(first('vinnie'));showVinnie();});
$('professions-btn').addEventListener('click',showProfessions);
$('quests-btn').addEventListener('click',showJournal);
$('regions-btn').addEventListener('click',showRegions);
$('select-army').addEventListener('click',selectArmy);
loadRegion(1,false);
engine.runRenderLoop(()=>{
  const dt=Math.min(engine.getDeltaTime()/1000,.05);
  animateWorld(dt);
  if(buildMode&&!paused)updateBuildPreview(pickTerrain());
  if(gameStarted&&!paused&&!gameEnded){
    keyboardPan(dt);
    updateGame(dt);
  }
  scene.render();
});
window.addEventListener('resize',()=>engine.resize());
