/** Geometry helpers used by both movement collision and defence tests. */
export interface Barrier {x:number;z:number;rotation:number;halfWidth:number;halfDepth:number;}
export function barrierDistance(x:number,z:number,b:Barrier){
 const dx=x-b.x,dz=z-b.z,c=Math.cos(b.rotation),s=Math.sin(b.rotation);
 const localX=dx*c-dz*s,localZ=dx*s+dz*c;
 return Math.hypot(Math.max(0,Math.abs(localX)-b.halfWidth),Math.max(0,Math.abs(localZ)-b.halfDepth));
}
export function crossesBarrier(ax:number,az:number,bx:number,bz:number,b:Barrier,padding=.5){
 const distance=Math.hypot(bx-ax,bz-az);const steps=Math.max(1,Math.ceil(distance/.3));
 for(let i=1;i<=steps;i++){const t=i/steps;if(barrierDistance(ax+(bx-ax)*t,az+(bz-az)*t,b)<padding)return true;}return false;
}
