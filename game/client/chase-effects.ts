import * as THREE from 'three';
import type {ChaseEvent} from '../shared/chase';

/** A fixed pool keeps repeated catches and footsteps from growing GPU memory. */
export class ChaseEffects {
  private readonly capacity=256;
  private readonly particles:THREE.InstancedMesh;
  private readonly life=new Float32Array(256);private readonly duration=new Float32Array(256);
  private readonly position=new Float32Array(256*3);private readonly velocity=new Float32Array(256*3);private readonly spin=new Float32Array(256);private readonly kind=new Float32Array(256);
  private readonly rings:THREE.Mesh[]=[];private readonly ringLife=new Float32Array(8);private readonly ringDuration=new Float32Array(8);
  private readonly matrix=new THREE.Matrix4();private readonly translation=new THREE.Vector3();private readonly scale=new THREE.Vector3();private readonly rotation=new THREE.Quaternion();private readonly turn=new THREE.Quaternion();private readonly axis=new THREE.Vector3(0,0,1);private readonly color=new THREE.Color();
  private limit=256;
  setLimit(limit:number){this.limit=Math.max(1,Math.min(this.capacity,limit));}
  private cursor=0;private ringCursor=0;
  constructor(scene:THREE.Scene,texture:THREE.CanvasTexture){
    const atlas=document.createElement('canvas');atlas.width=128;atlas.height=64;const ctx=atlas.getContext('2d')!;ctx.drawImage(texture.image as HTMLCanvasElement,0,0,64,64);ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(92,56);ctx.bezierCurveTo(70,42,79,14,103,7);ctx.bezierCurveTo(117,27,113,45,92,56);ctx.fill();ctx.globalCompositeOperation='destination-out';ctx.lineWidth=2;for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(78+i,22+i*6);ctx.lineTo(91+i,28+i*4);ctx.stroke();}ctx.globalCompositeOperation='source-over';ctx.strokeStyle='#aebdc9';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(89,59);ctx.quadraticCurveTo(96,32,103,10);ctx.stroke();const map=new THREE.CanvasTexture(atlas);const geometry=new THREE.PlaneGeometry(1,1);geometry.setAttribute('effectKind',new THREE.InstancedBufferAttribute(this.kind,1));const material=new THREE.MeshBasicMaterial({map,color:'#f0e8da',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});material.onBeforeCompile=shader=>{shader.vertexShader='attribute float effectKind; varying float vEffectKind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvEffectKind=effectKind;');shader.fragmentShader='varying float vEffectKind;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\nvec2 effectUV=vec2(vMapUv.x*0.5+(vEffectKind==1.0?0.5:0.0),vMapUv.y);diffuseColor*=texture2D(map,effectUV);\n#endif');};material.customProgramCacheKey=()=> 'ddg-puff-feather-atlas';this.particles=new THREE.InstancedMesh(geometry,material,this.capacity);this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.particles.frustumCulled=false;scene.add(this.particles);
    for(let i=0;i<8;i++){const ring=new THREE.Mesh(new THREE.RingGeometry(.92,1,32),new THREE.MeshBasicMaterial({color:'#fff1d2',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.visible=false;scene.add(ring);this.rings.push(ring);}
    for(let i=0;i<this.capacity;i++){this.matrix.makeScale(0,0,0);this.particles.setMatrixAt(i,this.matrix);this.particles.setColorAt(i,this.color);}
  }
  burst(x:number,z:number,count=18,feathers=false,color='#e7efff'){
    this.color.set(color);for(let n=0;n<count;n++){const i=this.cursor++%this.limit,o=i*3,angle=Math.random()*Math.PI*2,speed=.8+Math.random()*2.5;this.position[o]=x;this.position[o+1]=.6+Math.random()*.8;this.position[o+2]=z;this.velocity[o]=Math.sin(angle)*speed;this.velocity[o+1]=1+Math.random()*2;this.velocity[o+2]=Math.cos(angle)*speed;this.duration[i]=this.life[i]=feathers?1.1:.6;this.kind[i]=feathers?1:color==='#b9ecff'?2:0;this.spin[i]=Math.random()*Math.PI*2;this.particles.setColorAt(i,this.color);}if(this.particles.instanceColor)this.particles.instanceColor.needsUpdate=true;this.particles.geometry.getAttribute('effectKind').needsUpdate=true;
  }
  ring(x:number,z:number,color='#fff1d2',duration=.45){const i=this.ringCursor++%8,m=this.rings[i];m.position.set(x,.09,z);(m.material as THREE.MeshBasicMaterial).color.set(color);this.ringDuration[i]=this.ringLife[i]=duration;m.visible=true;}
  event(e:ChaseEvent){
    if(e.type==='catch'){this.burst(e.x,e.z,20,true);this.burst(e.x,e.z,12,false);this.ring(e.x,e.z,'#fff1d2',.45);}
    if(e.type==='freeze'){this.burst(e.x,e.z,14,false,'#b9ecff');this.ring(e.x,e.z,'#b9ecff',.4);}
    if(e.type==='thaw'){this.burst(e.x,e.z,10,false,'#a9c7dd');this.ring(e.x,e.z,'#dce6ff',.3);}
    if(e.type==='pickup'||e.type==='hour'){this.burst(e.x,e.z,16,false,'#ffdb83');this.ring(e.x,e.z,'#ffe6a4',.55);}
    if(e.type==='miss'||e.type==='near')this.burst(e.x,e.z,8,false,'#c1cce4');
    if(e.type==='spawn'){this.burst(e.x,e.z,8,true);this.ring(e.x,e.z,'#ff7595',.4);}
  }
  update(dt:number,camera:THREE.Camera){
    for(let i=0;i<this.capacity;i++){const o=i*3;if(this.life[i]>0){this.life[i]=Math.max(0,this.life[i]-dt);this.velocity[o+1]-=dt*(this.kind[i]?1.4:3);this.position[o]+=this.velocity[o]*dt;this.position[o+1]=Math.max(.08,this.position[o+1]+this.velocity[o+1]*dt);this.position[o+2]+=this.velocity[o+2]*dt;const fade=this.life[i]/this.duration[i],size=this.kind[i]===1?.4:this.kind[i]===2?.12+(1-fade)*.2:.2+(1-fade)*.55;this.translation.set(this.position[o],this.position[o+1],this.position[o+2]);this.rotation.copy(camera.quaternion);this.turn.setFromAxisAngle(this.axis,this.spin[i]+(1-fade)*4);this.rotation.multiply(this.turn);this.scale.set(size*(this.kind[i]===1?.5:1)*Math.sqrt(fade),size*Math.sqrt(fade),1);this.matrix.compose(this.translation,this.rotation,this.scale);}else this.matrix.makeScale(0,0,0);this.particles.setMatrixAt(i,this.matrix);}
    this.particles.instanceMatrix.needsUpdate=true;
    for(let i=0;i<8;i++){const m=this.rings[i];if(this.ringLife[i]<=0){m.visible=false;continue;}this.ringLife[i]=Math.max(0,this.ringLife[i]-dt);const progress=1-this.ringLife[i]/this.ringDuration[i];m.scale.setScalar(.4+progress*2.8);(m.material as THREE.MeshBasicMaterial).opacity=(1-progress)*.8;}
  }
}
