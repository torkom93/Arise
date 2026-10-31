/** Procedural visual assets. No gameplay state, external images or canvas dependency. */
import {Scene,Mesh,MeshBuilder,TransformNode,StandardMaterial,Color3,RawTexture,Texture,VertexData,VertexBuffer} from '@babylonjs/core';
import type {BuildingKind,Region} from './content';
type Paint='stone'|'brick'|'wood'|'beam'|'roof'|'plaster'|'metal'|'gold'|'cloth'|'cream'|'soil'|'wheat'|'glow'|'dark'|'leaf';
const fract=(n:number)=>n-Math.floor(n);
const hash=(x:number,y:number,seed=0)=>fract(Math.sin(x*127.1+y*311.7+seed*13.7)*43758.5453);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
function noise(x:number,y:number,seed:number){const i=Math.floor(x),j=Math.floor(y);let u=fract(x),v=fract(y);u=u*u*(3-2*u);v=v*v*(3-2*v);return mix(mix(hash(i,j,seed),hash(i+1,j,seed),u),mix(hash(i,j+1,seed),hash(i+1,j+1,seed),u),v);}
export class AriseArt {
 private paints=new Map<string,StandardMaterial>();
 private groundTextures=new Map<number,RawTexture>();
 private parts:Mesh[]=[];
 private normal:RawTexture;
 constructor(private scene:Scene){
  const data=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4;data[i]=128+(hash(x,y,31)-.5)*26;data[i+1]=128+(hash(x,y,63)-.5)*26;data[i+2]=254;data[i+3]=255;}
  this.normal=RawTexture.CreateRGBATexture(data,128,128,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
  this.normal.name='fine soil and stone normal';this.normal.uScale=24;this.normal.vScale=18;this.normal.level=.22;
 }
 private paint(key:Paint,hex?:string){
  const colors:Record<Paint,string>={stone:'#a3a598',brick:'#ac8063',wood:'#aa8053',beam:'#4d3e2d',roof:'#587d79',plaster:'#c6c1a0',metal:'#5a6b6c',gold:'#c8a55d',cloth:'#428c87',cream:'#e1d7b0',soil:'#61513a',wheat:'#c6ad62',glow:'#f1cb79',dark:'#182d29',leaf:'#527d4b'};
  const color=hex??colors[key],id=key+color;const found=this.paints.get(id);if(found)return found;
  const mat=new StandardMaterial('art/'+id,this.scene);mat.diffuseColor=Color3.FromHexString(color);mat.specularColor=new Color3(.055,.055,.045);
  if(key==='glow')mat.emissiveColor=new Color3(.28,.16,.035);
  if(['stone','brick','wood','beam','roof','plaster','soil'].includes(key)){
   const pixels=new Uint8Array(128*128*4);
   for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const i=(y*128+x)*4,n=hash(x,y,9),row=Math.floor(y/23),bx=(x+(row%2)*23)%46,by=y%23;
    let v=.83+n*.17;
    if(key==='stone'||key==='brick'){v=bx<2||by<2?.53:.87+(hash(Math.floor((x+(row%2)*23)/46),row,2)-.5)*.22+n*.08;}
    if(key==='wood'||key==='beam'){v=.79+Math.sin(x*.63+Math.sin(y*.06)*1.8)*.06+n*.1;if(x%24<1.5)v*=.65;}
    if(key==='roof'){const rx=(x+(Math.floor(y/16)%2)*8)%16;v=y%16<2||rx<1?.55:.84+n*.15;}
    if(key==='soil')v=.65+n*.32;
    pixels[i]=pixels[i+1]=pixels[i+2]=Math.max(0,Math.min(255,v*255));pixels[i+3]=255;
   }
   mat.diffuseTexture=RawTexture.CreateRGBATexture(pixels,128,128,this.scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);mat.diffuseTexture.name=id+' surface';
  }
  this.paints.set(id,mat);return mat;
 }
 private block(x:number,y:number,z:number,w:number,h:number,d:number,p:Paint,hex?:string){const m=MeshBuilder.CreateBox('art/block',{width:w,height:h,depth:d},this.scene);m.position.set(x,y,z);m.material=this.paint(p,hex);this.parts.push(m);return m;}
 private round(x:number,y:number,z:number,r:number,h:number,p:Paint,top=r,hex?:string,sides=10){const m=MeshBuilder.CreateCylinder('art/round',{diameter:r*2,diameterTop:top*2,height:h,tessellation:sides},this.scene);m.position.set(x,y,z);m.material=this.paint(p,hex);this.parts.push(m);return m;}
 private orb(x:number,y:number,z:number,r:number,p:Paint,hex?:string){const m=MeshBuilder.CreateIcoSphere('art/crown',{radius:r,subdivisions:1,flat:true},this.scene);m.position.set(x,y,z);m.material=this.paint(p,hex);this.parts.push(m);return m;}
 private ring(x:number,y:number,z:number,r:number,p:Paint){const m=MeshBuilder.CreateTorus('art/ring',{diameter:r*2,thickness:.12,tessellation:16},this.scene);m.position.set(x,y,z);m.material=this.paint(p);this.parts.push(m);return m;}
 private gable(x:number,y:number,z:number,w:number,h:number,d:number){
  const p=[[-w/2,0,-d/2],[w/2,0,-d/2],[0,h,-d/2],[-w/2,0,d/2],[w/2,0,d/2],[0,h,d/2]];
  const faces=[[0,2,1],[3,4,5],[0,1,4,3],[0,3,5,2],[1,2,5,4]],positions:number[]=[],indices:number[]=[],uvs:number[]=[];
  for(const face of faces){const offset=positions.length/3;face.forEach((v,i)=>{positions.push(...p[v]);uvs.push(i===1||i===2?1:0,i>=2?1:0);});indices.push(offset,offset+1,offset+2);if(face.length===4)indices.push(offset,offset+2,offset+3);}
  const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);const data=new VertexData();Object.assign(data,{positions,indices,normals,uvs});
  const m=new Mesh('art/gable',this.scene);data.applyToMesh(m);m.material=this.paint('plaster');m.position.set(x,y,z);this.parts.push(m);
 }
 private roof(x:number,y:number,z:number,w:number,d:number,rise:number,paint:Paint='roof'){
  const half=w/2,angle=Math.atan2(rise,half),slope=Math.hypot(half,rise);
  for(const sign of [-1,1]){const m=this.block(x+sign*w/4,y+rise/2,z,slope+.12,.18,d,paint);m.rotation.z=-sign*angle;}
  this.block(x,y+rise+.08,z,.18,.17,d+.15,'beam');
  for(const end of [-1,1])for(const sign of [-1,1]){const trim=this.block(x+sign*w/4,y+rise/2,z+end*d/2,slope+.18,.22,.18,'beam');trim.rotation.z=-sign*angle;}
 }
 private window(x:number,y:number,z:number){this.block(x,y,z,1,.95,.16,'beam');this.block(x,y,z-.1,.72,.68,.1,'glow');this.block(x,y,z-.17,.07,.8,.06,'beam');this.block(x,y,z-.17,.8,.07,.06,'beam');this.block(x,y-.55,z-.1,1.15,.13,.4,'wood');}
 private door(x:number,y:number,z:number,w=1.2){this.block(x,y,z,w+.22,2.05,.18,'beam');this.block(x,y-.04,z-.12,w,1.85,.08,'wood');for(const h of [-.5,.5])this.block(x,y+h,z-.2,w,.12,.07,'metal');this.orb(x+w*.28,y,z-.23,.065,'gold');}
 private house(w=4.4,d=3.8,h=2.8,x=0,z=0){
  this.block(x,.28,z,w+.5,.55,d+.5,'stone');this.block(x,.55+h/2,z,w,h,d,'plaster');
  for(const sx of [-1,1])for(const sz of [-1,1])this.block(x+sx*(w/2-.1),.55+h/2,z+sz*(d/2-.04),.2,h+.12,.2,'beam');
  this.block(x,1.25,z-d/2-.05,w,.17,.18,'beam');this.block(x,.55+h,z,w+.25,.2,d+.2,'beam');
  this.gable(x,.55+h,z,w,1.45,d);this.roof(x,.55+h,z,w+.8,d+.8,1.65);
  this.door(x,1.42,z-d/2-.13);if(w>3){this.window(x-w*.32,2.15,z-d/2-.12);this.window(x+w*.32,2.15,z-d/2-.12);}
  this.block(x,.12,z-d/2-.6,1.9,.24,1,'stone');
 }
 private barrel(x:number,y:number,z:number){this.round(x,y+.45,z,.42,.9,'wood',.36);for(const h of [.17,.7])this.round(x,y+h,z,.44,.08,'metal');}
 private flag(x:number,y:number,z:number){this.round(x,y/2,z,.07,y,'beam');this.block(x+.48,y-.5,z,.9,.65,.08,'cloth');this.orb(x,y+.08,z,.13,'gold');}
 private tower(x:number,z:number,height:number,fortified=true){
  this.round(x,.28,z,1.8,.55,'stone');this.round(x,height/2+.4,z,1.45,height,'stone',1.32,undefined,12);
  this.round(x,height+.5,z,1.8,.45,'beam');this.round(x,height+.82,z,1.8,.22,'stone');
  if(fortified){for(let i=0;i<8;i++){const a=i*Math.PI/4;this.block(x+Math.cos(a)*1.48,height+1.25,z+Math.sin(a)*1.48,.55,.7,.55,'stone');}}
  else this.roof(x,height+.7,z,3.8,3.8,1.7);
  this.block(x,2.3,z-1.39,.18,1.0,.13,'dark');
 }
 private finish(parent:TransformNode|undefined,pick:boolean,kind:string){
  const groups=new Map<StandardMaterial,Mesh[]>();for(const m of this.parts){const mat=m.material as StandardMaterial;const list=groups.get(mat)??[];list.push(m);groups.set(mat,list);}
  const result:Mesh[]=[];
  for(const list of groups.values()){
   const mesh=Mesh.MergeMeshes(list,true,true,undefined,false,false);if(!mesh)continue;
   mesh.name='art/'+kind;mesh.parent=parent??null;mesh.isPickable=pick;mesh.metadata={...(parent&&pick?{entityId:parent.name}:{}),visualKind:kind,decoration:!pick};
   if(!parent)mesh.freezeWorldMatrix();result.push(mesh);
  }
  this.parts=[];return result;
 }
 building(root:TransformNode,kind:BuildingKind|'base',gateOpen=false){
  this.parts=[];
  // Dark, low footprint gives the buildings a readable contact with the ground.
  if(!['brickWall','gate','fishTrap','dock','harbor'].includes(kind))this.round(0,.025,0,kind==='base'?4.8:3.1,.04,'dark');
  if(kind==='base'){
   this.house(7,5,3.5);this.roof(0,3.95,-3.2,3.5,2.3,1.1);for(const x of [-1.4,1.4])this.block(x,2,-3.7,.22,3.6,.22,'beam');
   for(const z of [-1.9,1.9]){this.orb(0,6.3,z,.19,'gold');}
   this.flag(-3,7.1,1.6);this.barrel(3.5,0,-1.5);this.barrel(3.5,0,-.5);
  }else if(kind==='brickWall'){
   this.block(0,.2,0,8,.4,1.5,'stone');this.block(0,1.45,0,8,2.55,1.2,'brick');this.block(0,2.85,0,8.1,.25,1.5,'stone');
   for(const x of [-3.5,0,3.5])this.block(x,1.5,.08,.35,2.6,1.45,'stone');
   for(let i=0;i<7;i++)this.block(-3.5+i*1.17,3.18,0,.7,.55,1.4,'stone');
  }else if(kind==='gate'){
   for(const x of [-3.6,3.6]){this.block(x,2,0,1,4,1.6,'stone');this.block(x,4.1,0,1.4,.25,1.9,'stone');}
   this.block(0,4.3,0,8,.65,1.6,'brick');this.block(0,4.73,0,8.2,.2,1.9,'stone');
   if(!gateOpen){this.block(0,1.9,0,6.1,3.8,.42,'wood');for(const x of [-2.6,0,2.6])this.block(x,1.9,-.28,.17,3.7,.13,'metal');for(const y of [.55,2.8])this.block(0,y,-.3,6,.15,.13,'metal');}
  }else if(kind==='outpost'){
   for(const x of [-1.4,1.4])for(const z of [-1.4,1.4])this.block(x,2.2,z,.3,4.4,.3,'beam');
   this.block(0,4.3,0,3.7,.3,3.7,'wood');for(const x of [-1.6,1.6])this.block(x,4.9,0,.15,.7,3.4,'wood');this.roof(0,5.25,0,4.1,4.1,1.1);this.flag(0,7.6,.4);
   for(let i=0;i<9;i++)this.block(0,.3+i*.43,-1.5,.8,.09,.18,'wood');
  }else if(['tower','guardTower','bomberTower'].includes(kind)){
   this.tower(0,0,4.5,kind!=='tower');
   if(kind==='bomberTower'){const gun=this.round(0,6.1,-.45,.48,2,'metal',.58);gun.rotation.x=-.7;this.round(0,5.5,0,.9,.35,'wood');this.barrel(2,0,.7);}
   else{this.flag(.4,7.7,.5);if(kind==='guardTower'){this.block(0,5.9,-1.2,2,.15,.18,'beam');this.block(0,6.1,-1.2,.14,.65,.14,'metal');}}
  }else if(kind==='castle'||kind==='fortifiedChurch'){
   this.house(kind==='castle'?4.4:4,4.6,4.1);
   const corners=kind==='castle'?[-2.6,2.6]:[-2.3];for(const x of corners)for(const z of [-2.5,2.5])this.tower(x,z,kind==='castle'?5.2:5.5);
   this.flag(0,8.8,1);if(kind==='fortifiedChurch'){this.block(0,7.8,-1,.25,2,.25,'gold');this.block(0,8.1,-1,1.4,.25,.25,'gold');}
  }else if(kind==='house'){
   this.house(4.4,3.8,2.8);this.barrel(2.5,0,.9);this.block(-2,3.8,1,.65,2.6,.7,'brick');
  }else if(kind==='kitchen'){
   this.house(4.4,3.8,2.5);this.block(1.5,3.5,1,.9,5,.9,'brick');
   this.block(-1.5,.7,-2.5,1.4,1.2,1,'stone');this.orb(-1.5,1.1,-3,.25,'glow');
   this.round(-1.5,1.5,-2.5,.5,.6,'metal');this.barrel(2.5,0,-1);this.barrel(2.5,0,.2);
  }else if(kind==='farm'){
   this.block(0,.06,0,5.9,.1,5.3,'soil');for(let row=0;row<5;row++){const z=-2+row;this.block(0,.16,z,5.5,.15,.48,'soil');for(let i=0;i<8;i++){const x=-2.3+i*.65;this.block(x,.6,z,.045,.85,.045,'wheat');const seed=this.orb(x+.06,1.03,z,.12,'wheat');seed.scaling.set(.5,1.7,.6);}}
   for(const x of [-2.9,2.9]){this.block(x,.55,0,.14,1.1,5.7,'beam');}this.barrel(2.5,0,2.7);
  }else if(kind==='mill'){
   this.round(0,2.4,0,1.7,4.6,'plaster',1.25);this.round(0,5.3,0,2,1.8,'roof',0);this.door(0,1.25,-1.6);
   this.round(0,3.9,-1.6,.3,.65,'beam').rotation.x=Math.PI/2;
   for(let i=0;i<4;i++){const a=i*Math.PI/2+.45,cx=Math.sin(a)*1.45,cy=3.9+Math.cos(a)*1.45;this.block(cx,cy,-2,.16,3,.13,'beam').rotation.z=-a;this.block(cx+.14*Math.cos(a),cy-.14*Math.sin(a),-2, .68,2.3,.08,'cream').rotation.z=-a;}
   this.barrel(2.2,0,.5);
  }else if(kind==='fishTrap'){
   for(const x of [-1.8,1.8])for(const z of [-1.8,1.8])this.round(x,.65,z,.08,1.6,'beam');
   for(let i=-2;i<=2;i++){this.block(i*.7,.4,0,.04,.04,3.5,'cream');this.block(0,.4,i*.7,3.5,.04,.04,'cream');}
   this.round(0,.45,0,.7,.9,'wood',.9);this.ring(0,.95,0,.85,'beam');
  }else if(kind==='dock'||kind==='harbor'){
   this.block(0,.55,1,4.9,.3,6.8,'wood');for(const x of [-2.1,2.1])for(const z of [-1.6,1.5,4]){this.round(x,.5,z,.16,1.7,'beam');this.round(x,1.35,z,.2,.12,'cream');}
   this.house(2.8,2,1.7,-.6,-1.1);this.barrel(1.7,.7,.4);this.barrel(1.7,.7,1.4);
   if(kind==='harbor'){this.block(1.5,3.3,2,.25,5,.25,'beam');const arm=this.block(.65,5.4,2,2.7,.22,.25,'beam');arm.rotation.z=.2;this.block(-.5,4.4,2,.055,2,.055,'cream');this.round(-.5,3.5,2,.45,.5,'metal');}
  }else if(kind==='sanctuary'){
   this.round(0,.25,0,2.7,.5,'stone');this.round(0,.6,0,2.1,.25,'stone');
   for(let i=0;i<5;i++){const a=i*Math.PI*.4;const pillar=this.block(Math.cos(a)*1.9,1.6,Math.sin(a)*1.9,.5,2.6,.65,'stone');pillar.rotation.y=-a;this.block(Math.cos(a)*1.9,2.9,Math.sin(a)*1.9,.2,.15,.2,'glow');}
   const crystal=this.orb(0,2.5,0,.8,'cloth','#72d9dc');crystal.scaling.set(.75,2.2,.75);this.ring(0,1.25,0,1.2,'gold');
  }else if(kind==='market'){
   for(const x of [-1.45,1.45]){this.block(x,.7,0,2.25,1.1,2.3,'wood');for(const z of [-1.2,1.2])this.block(x,1.65,z,.12,3.1,.12,'beam');
    for(let stripe=0;stripe<5;stripe++)this.block(x-.9+stripe*.45,2.85,-.1,.45,.13,2.9,stripe%2?'cream':'cloth');
    for(let i=0;i<4;i++)this.orb(x-.7+i*.45,1.4,-.4,.21,'wheat',i%2?'#b07e4e':'#77934d');}this.barrel(0,0,1.8);
  }else if(kind==='miningCamp'){
   this.house(3.4,2.7,2.1,-.5,.4);for(const x of [-2,2])this.block(x,2,-1.8,.25,3.8,.25,'beam');this.block(0,3.9,-1.8,4.6,.25,.25,'beam');this.block(.5,2.8,-1.8,.07,2,.07,'cream');this.round(.5,1.8,-1.8,.55,.65,'metal');
   for(let i=0;i<4;i++)this.orb(2,.3+i*.17,.5+i*.25,.45,'stone');
  }else if(kind==='archeryRange'){
   this.house(4.4,3.1,2.3,0,.3);for(const x of [-1.35,1.35]){this.block(x,.9,-2,.13,1.7,.13,'beam');const target=this.round(x,1.8,-2,.65,.14,'cream');target.rotation.x=Math.PI/2;const ring=this.ring(x,1.8,-2.1,.38,'brick');ring.rotation.x=Math.PI/2;this.orb(x,1.8,-2.2,.13,'cloth');}
  }else if(kind==='stable'){
   this.house(4.7,4.1,2.5);for(const x of [-1.6,0,1.6])this.block(x,1,-2.7,.13,1.9,.14,'beam');for(const y of [.55,1.3])this.block(0,y,-2.7,3.4,.14,.15,'wood');this.round(2.3,.55,1.6,.6,1,'wheat');
  }else if(kind==='university'){
   this.house(4.8,4.2,3.5);this.round(0,5.5,0,1.4,1.6,'roof',.15);this.orb(0,6.4,0,.17,'gold');for(let i=0;i<3;i++)this.block(0,.12+i*.17,-2.8+i*.25,2.5-i*.25,.22,.65,'stone');
  }else if(kind==='monastery'){
   this.house(3.9,4.2,3.1);this.block(1.25,4,1.2,1.2,4.3,1.3,'stone');this.roof(1.25,6.2,1.2,1.8,1.9,1.1);this.block(1.25,7.6,1.2,.16,1.1,.16,'gold');this.block(1.25,7.8,1.2,.75,.16,.16,'gold');
  }else{
   this.house(kind==='siegeWorkshop'?5:4.4,3.8,2.7);
   if(kind==='blacksmith'){
    this.block(1.5,3.3,.6,.8,5.3,.9,'brick');this.block(-1.6,.8,-2.3,1.3,1.3,1,'stone');this.orb(-1.6,1.1,-2.85,.28,'glow');this.block(.8,.8,-2.1,.5,.8,.5,'beam');this.block(.8,1.3,-2.1,1.05,.24,.5,'metal');
   }else if(kind==='sawMill'||kind==='siegeWorkshop'){
    for(let i=0;i<4;i++){const log=this.round(-1.6+i*.58,.45+(i%2)*.45,-2.25,.25,2.5,'wood');log.rotation.x=Math.PI/2;}
    this.block(1.6,1,-2.3,.18,1.5,.18,'beam');const wheel=this.ring(1.6,1.5,-2.3,.65,'metal');wheel.rotation.x=Math.PI/2;
   }else {this.flag(2,6.4,1);for(const x of [-1,1])this.block(x,1.8,-2.5,.07,2,.1,'metal').rotation.z=x*.25;this.barrel(2.25,0,-1.5);}
  }
  const meshes=this.finish(root,true,kind);
  // Keep wall visuals inside their four-cell span so consecutive sections meet.
  if(kind==='brickWall'||kind==='gate')for(const mesh of meshes)mesh.scaling.x=kind==='gate'?8/8.6:8/8.1;
  return meshes;
 }
 tree(parent:TransformNode|undefined,x:number,z:number,height:number,pick:boolean,foliage:string,variant:number){
  this.parts=[];const h=height,seed=Math.abs(x*31+z*17+variant*7),broad=variant%4===0;
  this.round(x,.95*h,z,.25*h,1.9*h,'wood',.13*h);
  for(let i=0;i<3;i++){const a=i*2.1+seed;const branch=this.round(x+Math.cos(a)*.35*h,1.6*h,z+Math.sin(a)*.35*h,.085*h,1.15*h,'beam',.025*h);branch.rotation.z=Math.cos(a)*.7;branch.rotation.x=Math.sin(a)*.7;}
  const base=Color3.FromHexString(foliage);
  if(broad){
   for(let i=0;i<6;i++){const a=i*2.4;const shade=base.scale(.82+(i%3)*.13);this.orb(x+Math.cos(a)*.7*h,2.5*h+(i%3)*.4*h,z+Math.sin(a)*.7*h,(.8+hash(i,1)*.3)*h,'leaf',shade.toHexString());}
  }else{
   for(let layer=0;layer<4;layer++){const shade=base.scale(.8+layer*.1),radius=(1.45-layer*.29)*h;const crown=this.round(x+Math.sin(seed+layer)*.1*h,(1.85+layer*.68)*h,z+Math.cos(seed+layer)*.1*h,radius,1.7*h,'leaf',.04*h,shade.toHexString(),7);crown.rotation.y=seed+layer*.7;}
   for(let i=0;i<3;i++)this.orb(x+Math.cos(i*2.1)*.7*h,2.3*h+(i%2)*.5*h,z+Math.sin(i*2.1)*.7*h,.55*h,'leaf',base.scale(.85).toHexString());
  }
  for(let i=0;i<3;i++){const a=i*2.1;this.block(x+Math.cos(a)*.23*h,.1*h,z+Math.sin(a)*.23*h,.18*h,.18*h,.7*h,'beam').rotation.y=-a;}
  return this.finish(parent,pick,broad?'broadleaf':'pine');
 }
 terrain(ground:Mesh,region:Region){
  let texture=this.groundTextures.get(region.id);
  if(!texture){
   const size=512,pixels=new Uint8Array(size*size*4),base=Color3.FromHexString(region.terrain).scale(1.5);
   for(let py=0;py<size;py++)for(let px=0;px<size;px++){
    const x=(px/size-.5)*90,z=(py/size-.5)*68;
    const coarse=noise(x*.16,z*.16,region.seed),grain=hash(px,py,region.seed),detail=noise(x*.72,z*.72,22);
    let r=base.r*(.78+coarse*.38),g=base.g*(.78+coarse*.38),b=base.b*(.78+coarse*.38);
    // Smooth dirt route from the settlement to this region's actual rift position.
    const t=Math.max(0,Math.min(1,(x+26)/(region.rift[0]+26))),pathZ=-10+(region.rift[1]+10)*t+Math.sin(t*Math.PI*2)*1.5;
    const width=1.25+coarse*.7,dist=Math.abs(z-pathZ),road=x>=-28&&x<=region.rift[0]+2?Math.max(0,1-dist/width):0;
    const clearing=Math.max(0,1-Math.hypot(x+26,z+10)/6.5)*.6;
    const dirt=Math.max(road,clearing),speck=(grain-.5)*.10+(detail-.5)*.05;
    r=mix(r,.39+coarse*.1,dirt)+speck;g=mix(g,.33+coarse*.08,dirt)+speck;b=mix(b,.24+coarse*.06,dirt)+speck;
    const i=(py*size+px)*4;pixels[i]=Math.min(255,Math.max(0,r*255));pixels[i+1]=Math.min(255,Math.max(0,g*255));pixels[i+2]=Math.min(255,Math.max(0,b*255));pixels[i+3]=255;
   }
   texture=RawTexture.CreateRGBATexture(pixels,size,size,this.scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);texture.name='region '+region.id+' grass earth gravel';this.groundTextures.set(region.id,texture);
  }
  const mat=ground.material as StandardMaterial;mat.diffuseColor=Color3.White();mat.diffuseTexture=texture;mat.bumpTexture=this.normal;mat.specularColor=new Color3(.02,.025,.02);
  // Very shallow relief adds changing surface normals without changing movement heights.
  const positions=ground.getVerticesData(VertexBuffer.PositionKind);if(positions){for(let i=0;i<positions.length;i+=3){const x=positions[i],z=positions[i+2];positions[i+1]=-.11*Math.pow(noise(x*.22,z*.22,region.seed),2);}ground.updateVerticesData(VertexBuffer.PositionKind,positions);const normals:number[]=[];VertexData.ComputeNormals(positions,ground.getIndices()!,normals);ground.updateVerticesData(VertexBuffer.NormalKind,normals);}
 }
 scatter(region:Region){
  this.parts=[];
  // Two hundred small ground details share just a few merged material batches.
  for(let i=0;i<200;i++){
   const x=-43+hash(i,2,region.seed)*86,z=-31+hash(i,9,region.seed)*(region.coastal?49:62);
   const t=Math.max(0,Math.min(1,(x+26)/(region.rift[0]+26))),path=-10+(region.rift[1]+10)*t+Math.sin(t*Math.PI*2)*1.5;
   if(Math.hypot(x+26,z+10)<7||Math.hypot(x-region.rift[0],z-region.rift[1])<6)continue;
   if(Math.abs(z-path)<2){this.orb(x,.07,z,.08+hash(i,3)*.12,'stone');continue;}
   for(let blade=0;blade<3;blade++){const grass=this.block(x+(blade-1)*.09,.16,z,.035,.25+hash(i,blade)*.18,.035,'leaf',Color3.FromHexString(region.foliage).scale(.8).toHexString());grass.rotation.z=(blade-1)*.35;}
   if(i%11===0)this.orb(x,.35,z,.065,'wheat');
  }
  return this.finish(undefined,false,'ground details');
 }
}
