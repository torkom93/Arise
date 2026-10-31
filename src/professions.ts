import type {Cost, BuildingKind} from './content';
export type ResourceKind='wood'|'stone'|'rock'|'iron'|'clay'|'herbs';
export type ItemKind='plank'|'brick'|'ironBar'|'stoneBlock'|'salve'|'fieldRations'|'weaponKit'|'armorKit';
export type Profession='forestry'|'mining'|'masonry'|'smithing'|'alchemy'|'cooking';
export const PROFESSIONS:Record<Profession,{name:string;description:string}>={
 forestry:{name:'Skogbruk',description:'Samle tømmer og lag planker. Hvert nivå gir +5% manuell tømmerinnsamling.'},
 mining:{name:'Gruvedrift',description:'Samle aether, stein, jern og leire. Hvert nivå gir +5% manuell mineralinnsamling.'},
 masonry:{name:'Murerfag',description:'Lag murstein og steinblokker til forsvarsverk.'},
 smithing:{name:'Smedfag',description:'Smelt jern og lag våpen- og rustningssett.'},
 alchemy:{name:'Urtekunnskap og alkymi',description:'Samle urter og lag helbredende salver. Hvert nivå gir +5% urteinnsamling.'},
 cooking:{name:'Matlaging',description:'Lag feltrasjoner som kan brukes for å få mer mat.'}
};
export const RESOURCE_DEFS:Record<ResourceKind,{name:string;icon:string;profession:Profession;color:string;description:string}>={
 wood:{name:'Tømmer',icon:'▥',profession:'forestry',color:'#917248',description:'Planker, bygninger og tropper.'},
 stone:{name:'Aether',icon:'◆',profession:'mining',color:'#6ed2dd',description:'Forskning, bygninger og tropper. Holdes adskilt fra vanlig stein.'},
 rock:{name:'Stein',icon:'⬡',profession:'mining',color:'#9caaa8',description:'Steinblokker, murstein og tårn.'},
 iron:{name:'Jernmalm',icon:'⛏',profession:'mining',color:'#b4836d',description:'Smeltes til jernbarrer for utstyr og Bomber Tower.'},
 clay:{name:'Leire',icon:'▰',profession:'mining',color:'#be8960',description:'Brennes til murstein for mur, port og tårn.'},
 herbs:{name:'Urter',icon:'✿',profession:'alchemy',color:'#8fb96d',description:'Helbredende salver og feltrasjoner.'}
};
export const ITEM_NAMES:Record<ItemKind,string>={plank:'Planker',brick:'Murstein',ironBar:'Jernbarrer',stoneBlock:'Steinblokker',salve:'Helbredende salve',fieldRations:'Feltrasjoner',weaponKit:'Våpensett',armorKit:'Rustningssett'};
export const isResourceKind=(kind:string):kind is ResourceKind=>Object.hasOwn(RESOURCE_DEFS,kind);
export interface Recipe {name:string;profession:Profession;level:number;cost:Cost;output:ItemKind;count:number;seconds:number;xp:number;station?:BuildingKind;description:string;}
export const RECIPES:Record<string,Recipe>={
 planks:{name:'Sag planker',profession:'forestry',level:1,cost:{wood:15,stone:0},output:'plank',count:5,seconds:5,xp:10,description:'Planker brukes til porter og våpensett.'},
 bricks:{name:'Brenn murstein',profession:'masonry',level:1,cost:{wood:5,stone:0,materials:{clay:10,rock:5}},output:'brick',count:5,seconds:6,xp:12,description:'Murstein brukes i mur, port og forsvarstårn.'},
 blocks:{name:'Hugg steinblokker',profession:'masonry',level:1,cost:{wood:0,stone:0,materials:{rock:15}},output:'stoneBlock',count:5,seconds:6,xp:10,description:'Steinblokker brukes til Guard Tower.'},
 bars:{name:'Smelt jern',profession:'smithing',level:1,cost:{wood:10,stone:0,materials:{iron:12}},output:'ironBar',count:4,seconds:8,xp:15,description:'Jernbarrer brukes i utstyr og Bomber Tower.'},
 salves:{name:'Bland helbredende salve',profession:'alchemy',level:1,cost:{wood:0,stone:0,materials:{herbs:4}},output:'salve',count:1,seconds:5,xp:10,description:'Bruk på valgt skadet alliert enhet: helbreder 80 HP.'},
 rations:{name:'Tilbered feltrasjoner',profession:'cooking',level:1,cost:{wood:5,stone:0,food:20,materials:{herbs:2}},output:'fieldRations',count:1,seconds:5,xp:10,station:'kitchen',description:'Krever ferdig Kitchen. Bruk fra sekken: gir 40 mat (20 netto etter ingredienser).'},
 weapons:{name:'Smi våpensett',profession:'smithing',level:2,cost:{wood:0,stone:10,materials:{ironBar:3,plank:2}},output:'weaponKit',count:1,seconds:12,xp:20,station:'blacksmith',description:'Krever ferdig Blacksmith. Gir valgt helt eller militærtropp +4 skade, én gang per enhet.'},
 armor:{name:'Smi rustningssett',profession:'smithing',level:3,cost:{wood:0,stone:15,materials:{ironBar:5}},output:'armorKit',count:1,seconds:14,xp:25,station:'blacksmith',description:'Krever ferdig Blacksmith. Gir valgt helt eller militærtropp +5 forsvar, én gang per enhet.'}
};
export type ProfessionState=Record<Profession,number>;
export const newProfessionState=():ProfessionState=>({forestry:0,mining:0,masonry:0,smithing:0,alchemy:0,cooking:0});
export const XP_THRESHOLDS=[0,30,90,180,300];
export function professionLevel(xp:number){return XP_THRESHOLDS.filter(t=>Math.max(0,xp)>=t).length;}
export function gatherMultiplier(profession:Profession,state:ProfessionState){return 1+.05*(professionLevel(state[profession])-1);}
export function recipeLock(recipe:Recipe,state:ProfessionState,stations:BuildingKind[]):string|null{
 if(professionLevel(state[recipe.profession])<recipe.level)return `Krever ${PROFESSIONS[recipe.profession].name} nivå ${recipe.level}`;
 if(recipe.station&&!stations.includes(recipe.station))return 'Krever ferdig '+(recipe.station==='kitchen'?'Kitchen':'Blacksmith');return null;
}
export function mitigation(armor:number){return 1-Math.min(.5,Math.max(0,armor)/(Math.max(0,armor)+100));}
export const QUESTS={
 defences:{title:'Stein på stein',description:'Vinnie ber deg sikre leiren før mørket: samle 20 leire og 15 stein etter at oppdraget er tatt, lag minst 5 murstein og fullfør én Brick Wall.',reward:'80 tømmer, 40 mat og 25 XP i murerfag.'},
 medicine:{title:'Medisin før mørket',description:'Samle 12 urter etter at oppdraget er tatt, lag 3 helbredende salver og lever dem til Vinnie. Salvene forbrukes ved levering.',reward:'40 aether, 60 mat og 20 XP i alkymi.'}
};
export type QuestKey=keyof typeof QUESTS;
export type QuestProgress={status:'available'|'active'|'completed';baseline:Record<string,number>};
export const newQuestState=():Record<QuestKey,QuestProgress>=>({defences:{status:'available',baseline:{}},medicine:{status:'available',baseline:{}}});
