import type {BuildingKind} from './content';

export const GRID_SIZE = 2;
export type Footprint = {x:number; z:number; width:number; depth:number};
/** Reserved cells include roof overhangs and working space, not just the foundation. */
export function footprintSize(kind:BuildingKind|'base'|'rift',rotation=0):[number,number]{
 let width=8,depth=8;
 if(kind==='base'||kind==='rift'||kind==='castle'||kind==='fortifiedChurch'){width=12;depth=12;}
 if(kind==='brickWall'||kind==='gate'){width=8;depth=2;}
 if(kind==='fishTrap'){width=4;depth=4;}
 if(kind==='dock'||kind==='harbor'){width=8;depth=12;}
 if(Math.abs(Math.sin(rotation))>.5)[width,depth]=[depth,width];
 return [width,depth];
}
export function snapBuilding(kind:BuildingKind,x:number,z:number,rotation=0):Footprint{
 const [width,depth]=footprintSize(kind,rotation);
 const snap=(value:number,size:number)=>Math.round((value-size/2)/GRID_SIZE)*GRID_SIZE+size/2;
 return {x:snap(x,width),z:snap(z,depth),width,depth};
}
export function overlaps(a:Footprint,b:Footprint){
 return Math.abs(a.x-b.x)<(a.width+b.width)/2-1e-6&&Math.abs(a.z-b.z)<(a.depth+b.depth)/2-1e-6;
}
export function footprintCells(area:Footprint):[number,number][]{
 const cells:[number,number][]=[];
 for(let x=area.x-area.width/2+GRID_SIZE/2;x<area.x+area.width/2;x+=GRID_SIZE)
  for(let z=area.z-area.depth/2+GRID_SIZE/2;z<area.z+area.depth/2;z+=GRID_SIZE)cells.push([x,z]);
 return cells;
}
