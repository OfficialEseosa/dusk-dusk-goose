import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {ChaseQuality} from './chase-quality';
import {ChaseEffects} from './chase-effects';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {PARK,arenaFor,type Arena,TUNE,clearPath,distance,angle as angleTo,angleDelta,type Entity,type Point,type ChaseSnapshot} from '../shared/chase';

const ROOT='/assets/chase/';
const KIDS=['character-female-a','character-male-a','character-female-c','character-male-c','character-female-e','character-male-e'];
const PROPS=['pine','pine-fall','pine-fall-crooked','bench','pumpkin-carved','pumpkin-tall-carved','iron-fence','lightpost-single','hay-bale','lantern-glass'];
const NATURE=['plant_bush','plant_bushSmall','mushroom_tanGroup'];
const palette=['#ffb400','#2ec4b6','#b89bff','#78d96a','#ff9d69','#83b9ff'];
const unit=new THREE.Vector3(0,1,0),tmp=new THREE.Vector3(),box=new THREE.Box3();
function hash(id:string){let h=0;for(const c of id)h=(h*31+c.charCodeAt(0))>>>0;return h;}
function radial(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d')!,g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#ffffff');g.addColorStop(.25,'#ffffffaa');g.addColorStop(1,'#ffffff00');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}

/** One fixed lighting program handles every beam; joining never adds a light. */
class BeamMaterials {
  // Retain one compiled goose material across the title-to-first-spawn gap.
  keepAlive?:THREE.MeshLambertMaterial;
  private colorScratch=new THREE.Color();
  pos=Array.from({length:6},()=>new THREE.Vector4());
  dir=Array.from({length:6},()=>new THREE.Vector4());
  tint=Array.from({length:6},()=>new THREE.Vector4());
  patch(material:THREE.MeshLambertMaterial,ambient=1,rim=.08){
    if(rim===.23&&!this.keepAlive)this.keepAlive=material;
    material.userData.ddgAmbient={value:ambient};material.onBeforeCompile=shader=>{
      shader.uniforms.ddgAmbient=material.userData.ddgAmbient;
      shader.uniforms.ddgPos={value:this.pos};shader.uniforms.ddgDir={value:this.dir};shader.uniforms.ddgTint={value:this.tint};
      shader.vertexShader='varying vec3 ddgWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nddgWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader='varying vec3 ddgWorld;\nuniform float ddgAmbient;\nuniform vec4 ddgPos[6];\nuniform vec4 ddgDir[6];\nuniform vec4 ddgTint[6];\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        outgoingLight *= ddgAmbient;
        for(int i=0;i<6;i++){
          vec3 delta=ddgWorld-ddgPos[i].xyz;float d=length(delta);
          float cone=smoothstep(ddgDir[i].w,0.989,dot(normalize(delta),ddgDir[i].xyz));
          float fall=pow(clamp(1.0-d/max(ddgPos[i].w,0.01),0.0,1.0),1.2);
          outgoingLight+=mix(diffuseColor.rgb,vec3(0.75,0.65,0.46),0.2)*ddgTint[i].rgb*ddgTint[i].a*cone*fall*3.4;
        }
        outgoingLight+=vec3(0.19,0.26,0.48)*pow(1.0-abs(normal.z),2.5)*${rim.toFixed(3)};
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>`ddg-beams-${rim}`;return material;
  }
  color(color:string){return this.patch(new THREE.MeshLambertMaterial({color,flatShading:true,vertexColors:true}));}
  update(entities:Entity[],positions:Map<string,Point>,color:string,now:number,arena:Arena){let slot=0;
    for(const e of entities){if(e.role!=='kid'||!e.light||slot===6)continue;const p=positions.get(e.id)??e;let range:number=TUNE.range;
      // Match the rule's occluders, shortening the visual beam at its centre ray.
      for(let d=.5;d<=TUNE.range;d+=.3){if(!clearPath(p,{x:p.x+Math.sin(e.aim)*d,z:p.z+Math.cos(e.aim)*d},arena,0,true)){range=d;break;}}
      this.pos[slot].set(p.x,1.3,p.z,range);this.dir[slot].set(Math.sin(e.aim)*.988,-.155,Math.cos(e.aim)*.988,Math.cos(TUNE.halfCone));
      const c=this.colorScratch.set(color);this.tint[slot].set(c.r,c.g,c.b,e.battery>=25||Math.sin(now*.025)>-.75?1:.15);slot++;
    }for(;slot<6;slot++)this.tint[slot].w=0;
  }
}

/** Static geometry is merged by texture pack, with source material colours baked. */
class Batches {
  groups=new Map<string,{material:THREE.MeshLambertMaterial;geometries:THREE.BufferGeometry[]}>();
  constructor(private scene:THREE.Scene|THREE.Group,private beams:BeamMaterials){}
  add(object:THREE.Object3D,key='paint'){
    object.updateMatrixWorld(true);object.traverse(node=>{if(!(node instanceof THREE.Mesh))return;
      const src=(Array.isArray(node.material)?node.material:[node.material]) as THREE.MeshStandardMaterial[];
      const raw=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();
      const groups=raw.groups.length?raw.groups:[{start:0,count:raw.getAttribute('position').count,materialIndex:0}];
      const colors=new Float32Array(raw.getAttribute('position').count*3);
      for(const group of groups){const m=src[group.materialIndex??0]??src[0],c=m.color??new THREE.Color('white');for(let i=group.start;i<group.start+group.count;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;}}
      raw.clearGroups();raw.setAttribute('color',new THREE.BufferAttribute(colors,3));raw.applyMatrix4(node.matrixWorld);
      for(const name of Object.keys(raw.attributes))if(!['position','normal','uv','color'].includes(name))raw.deleteAttribute(name);
      if(!raw.getAttribute('uv'))raw.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(colors.length/3*2),2));
      const p=raw.getAttribute('position');for(let i=0;i<p.count;i++){const shade=.8+.2*Math.min(1,Math.max(0,p.getY(i))/2.5);colors[i*3]*=shade;colors[i*3+1]*=shade;colors[i*3+2]*=shade;}
      const map=src[0].map;const id=map?(object.userData.texturePack??key):'paint';let batch=this.groups.get(id);if(!batch){batch={material:this.beams.patch(new THREE.MeshLambertMaterial({color:'white',map,vertexColors:true,flatShading:true,side:THREE.DoubleSide})),geometries:[]};this.groups.set(id,batch);}batch.geometries.push(raw);
    });
  }
  finish(){for(const b of this.groups.values()){const geometry=mergeGeometries(b.geometries);if(geometry){const mesh=new THREE.Mesh(geometry,b.material);mesh.receiveShadow=true;this.scene.add(mesh);}for(const g of b.geometries)g.dispose();}this.groups.clear();}
}

interface Figure {root:THREE.Group;body:THREE.Object3D;role:Entity['role'];mixer?:THREE.AnimationMixer;idle?:THREE.AnimationAction;run?:THREE.AnimationAction;hold?:THREE.AnimationAction;moving:boolean;phase:number;last:Point;hips?:THREE.Group;neck?:THREE.Group;wings?:THREE.Group[];legs?:THREE.Group[];eyes?:THREE.Group;brows?:THREE.Group;still:number;beam:THREE.Group;shadow:THREE.Mesh;marker:THREE.Mesh;ice?:THREE.Group;shield?:THREE.Mesh;gooseMaterial?:THREE.MeshLambertMaterial;born:number;stepAt:number;holdUntil?:number;holdAt?:Point;holdFacing?:number;convertUntil?:number;kidScale?:number;tell?:THREE.Group;stars?:THREE.Group;starsUntil?:number;slowUntil?:number;revealUntil?:number;sparkAt?:number;moteAt?:number;recoilUntil?:number;recoilFacing?:number}

export class ChaseArt {
  readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(35,1,.4,100);
  readonly renderer:THREE.WebGLRenderer;
  readonly ready:Promise<void>;
  private arena:Arena=PARK;private world=new THREE.Group();
  private assets=new Map<string,GLTF>();private beams=new BeamMaterials();private figures=new Map<string,Figure>();
  private quality=new ChaseQuality(matchMedia('(pointer:coarse)').matches,devicePixelRatio);private look=new THREE.Vector3();private targetColor=new THREE.Color();private frustum=new THREE.Frustum();private viewProjection=new THREE.Matrix4();private animationFrame=0;
  private terrainTexture?:THREE.Texture;
  private glow=radial();private focus=new THREE.Vector3();private ahead=new THREE.Vector3();private initialized=false;private previous=0;
  private drawPositions=new Map<string,Point>();private pickups:THREE.Group[]=[];private roof!:THREE.Mesh;private lampHalo!:THREE.Sprite;private lampPool!:THREE.Mesh;
  private moon!:THREE.DirectionalLight;private fireflies?:THREE.Points;private dropped:{mesh:THREE.Mesh;until:number;born:number}[]=[];private dropCursor=0;private dawnAt=0;private plants:THREE.Object3D[]=[];private titleEntities:Entity[]=[];private effects?:ChaseEffects;private eventRun='';private lastEvent=0;private trauma=0;private punchUntil=0;private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(canvas:HTMLCanvasElement){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(this.quality.ratio);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NeutralToneMapping;
    this.scene.add(this.world);this.scene.background=new THREE.Color('#23396b');this.scene.fog=new THREE.FogExp2('#293c70',.016);
    this.scene.add(new THREE.HemisphereLight('#8ca6ec','#3a375f',2.1));const moon=this.moon=new THREE.DirectionalLight('#a5c5ff',1.5);moon.position.set(-12,20,8);this.scene.add(moon);
    canvas.setAttribute('aria-busy','true');this.ready=this.load().then(()=>{this.build();canvas.setAttribute('aria-busy','false');});this.resize();
  }
  resize(){this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
  private async load(){const loader=new GLTFLoader();await Promise.all([...KIDS.map(n=>`mini-characters/${n}`),...PROPS.map(n=>`graveyard-kit/${n}`),...NATURE.map(n=>`nature-kit/${n}`)].map(async path=>{this.assets.set(path,await loader.loadAsync(`${ROOT}${path}.glb`));}));}
  private mesh(geometry:THREE.BufferGeometry,color:string,x=0,y=0,z=0){const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color,flatShading:true}));mesh.position.set(x,y,z);return mesh;}
  private prop(name:string,x:number,z:number,scale=1,angle=0,pack='graveyard-kit'){const model=this.assets.get(`${pack}/${name}`)!.scene.clone();model.position.set(x,0,z);model.scale.setScalar(scale);model.rotation.y=angle;model.userData.texturePack=pack;return model;}
  private halo(color:string,size:number,opacity=.6){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color,transparent:true,opacity,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));sprite.scale.setScalar(size);return sprite;}
  private disc(color:string,radius:number,opacity:number){const m=new THREE.Mesh(new THREE.PlaneGeometry(radius*2,radius*2),new THREE.MeshBasicMaterial({map:this.glow,color,transparent:true,opacity,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.y=.035;return m;}
  private groundTexture(){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!;let seed=1729;for(let y=0;y<128;y+=2)for(let x=0;x<128;x+=2){seed=(seed*1664525+1013904223)>>>0;const value=212+seed%44;ctx.fillStyle=`rgb(${value},${value},${value})`;ctx.fillRect(x,y,2,2);}const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(13,9);texture.colorSpace=THREE.SRGBColorSpace;this.terrainTexture=texture;return texture;}
  private buildWorld(){const batch=new Batches(this.world,this.beams);
    if(this.arena!==PARK){this.buildStreet(batch);batch.finish();return;}
    batch.add(this.mesh(new THREE.BoxGeometry(60,.5,50),'#426d68',0,-.3,0));
    const grass=this.mesh(new THREE.BoxGeometry(26,.14,18),'#4a8761',0,-.09,0);(grass.material as THREE.MeshLambertMaterial).map=this.groundTexture();batch.add(grass,'ground-grain');
    // Paths wrap the same server rectangles; flat paint never introduces collision.
    for(const z of [-6.3,6.3])batch.add(this.mesh(new THREE.BoxGeometry(26,.06,2.2),'#898392',0,.015,z));
    for(const x of [-10.7,10.7,-4.4,4.4])batch.add(this.mesh(new THREE.BoxGeometry(x*x>50?2:1.8,.05,18),'#898392',x,.02,0));
    for(let i=0;i<130;i++){const x=Math.sin(i*17.3)*12.7,z=Math.cos(i*8.21)*8.7;const patch=this.mesh(new THREE.CircleGeometry(.08+(i%4)*.055,5),['#b69954','#d89c4c','#af7844','#587c66'][i%4],x,.065,z);patch.rotation.x=-Math.PI/2;patch.rotation.z=i;batch.add(patch);}
    for(const s of PARK.solids){const shadow=this.mesh(new THREE.PlaneGeometry(s.w+.55,s.d+.55),'#2b4e4c',s.x,.055,s.z);shadow.rotation.x=-Math.PI/2;batch.add(shadow);}
    for(const s of PARK.solids.slice(1)){batch.add(this.mesh(new THREE.BoxGeometry(s.w,.4,s.d),'#305c59',s.x,.2,s.z));
      const alongX=s.w>s.d,count=Math.ceil(Math.max(s.w,s.d)/.65);for(let i=0;i<count;i++){const t=(i-(count-1)/2)*.65;const bush=this.prop(i%2?'plant_bush':'plant_bushSmall',s.x+(alongX?t:0),s.z+(alongX?0:t),1,0,'nature-kit');box.setFromObject(bush);const sz=box.getSize(tmp);bush.scale.multiplyScalar(.95/Math.max(sz.x,sz.z));bush.position.y=.4;batch.add(bush);const crown=this.mesh(new THREE.DodecahedronGeometry(.52,0),i%2?'#4e815b':'#63865a',bush.position.x,.61,bush.position.z);crown.scale.y=.85;batch.add(crown);}}
    // Low open bandstand: its deck exactly describes the existing central solid.
    batch.add(this.mesh(new THREE.BoxGeometry(5.8,.65,5.8),'#7c7390',0,.3,0));batch.add(this.mesh(new THREE.BoxGeometry(5.55,.16,5.55),'#b0a09a',0,.7,0));
    for(const x of [-2.3,2.3])for(const z of [-2.3,2.3])batch.add(this.mesh(new THREE.CylinderGeometry(.12,.15,2.4,6),'#b4bbc5',x,1.9,z));
    this.roof=this.mesh(new THREE.ConeGeometry(4.1,1.2,4),'#625887',0,3.65,0);this.roof.rotation.y=Math.PI/4;const rm=this.roof.material as THREE.MeshLambertMaterial;this.beams.patch(rm);rm.transparent=true;this.world.add(this.roof);
    for(const [x,z] of [[-2.3,2.3],[2.3,2.3],[-2.3,-2.3],[2.3,-2.3]]){batch.add(this.prop('pumpkin-carved',x,z,1.4));const glow=this.halo('#ffb34f',1.7,.4);glow.position.set(x,.4,z);this.world.add(glow);}
    // Everything tall stays outside the playable bounds or inside the existing solids.
    for(let i=0;i<36;i++){const side=i%4,t=Math.floor(i/4),x=side<2?-14.4+t*3.4:side===2?-14.5:14.5,z=side<2?side===0?-10.5:10.6:-9+t*2.5;batch.add(this.prop(i%4===0?'pine':i%3?'pine-fall':'pine-fall-crooked',x,z,1.4+(i%3)*.25,i*.7));}
    for(let i=0;i<22;i++)for(const z of [-9.6,9.6])batch.add(this.prop('iron-fence',-13+i*1.25,z,1.6));
    for(const x of [-1.7,1.7]){const bench=this.prop('bench',x,0,2.1,x>0?-Math.PI/2:Math.PI/2);bench.position.y=.8;batch.add(bench);}batch.add(this.prop('hay-bale',-13.8,4,2.1));
    for(let i=0;i<16;i++){const x=i%2?12.95:-12.95,z=-8+i*1.05;batch.add(this.prop('pumpkin-tall-carved',x,z,.9+(i%3)*.18,i));batch.add(this.prop('mushroom_tanGroup',x+(i%2?.6:-.6),z+.5,.8,0,'nature-kit'));}
    for(const [x,z] of [[-6,3.3],[6,-3.3],[-8,-3.5],[8,3.5]]){const pumpkin=this.prop('pumpkin-carved',x,z,1.6);pumpkin.position.y=.4;batch.add(pumpkin);const warm=this.halo('#ffc36b',1.6,.5);warm.position.set(x,.8,z);this.world.add(warm);const spill=this.disc('#e5a34f',1.3,.23);spill.position.x=x;spill.position.z=z;this.world.add(spill);}
    for(const x of [-2.9,2.9])for(const z of [-2.9,2.9]){const end=new THREE.Vector3(x,3.1,z),start=new THREE.Vector3(0,4.25,0),delta=end.clone().sub(start);const rib=this.mesh(new THREE.CylinderGeometry(.035,.045,delta.length(),5),'#a29abb');rib.position.copy(start.add(end).multiplyScalar(.5));rib.quaternion.setFromUnitVectors(unit,delta.normalize());batch.add(rib);}
    const ceiling=this.halo('#ffcc76',3.5,.45);ceiling.position.set(0,1.8,0);this.world.add(ceiling);
    const lamp=this.prop('lightpost-single',-3.8,0,1.5);batch.add(lamp);this.lampHalo=this.halo('#ffd277',3.4);this.lampHalo.position.set(-3.8,3.2,0);this.world.add(this.lampHalo);this.lampPool=this.disc('#ffc873',3,.2);this.lampPool.position.x=-3.8;this.world.add(this.lampPool);
    for(let i=0;i<6;i++){const p=this.prop('lantern-glass',i%2?14:-14,-8+i*3.1,1.5);batch.add(p);const glow=this.halo('#ffb44f',2.5,.55);glow.position.copy(p.position);glow.position.y=.6;this.world.add(glow);this.plants.push(glow);}
    batch.finish();
  }
  private houses:{root:THREE.Group;x:number;z:number;w:number;d:number}[]=[];
  private streetLamps:{halo:THREE.Sprite;pool:THREE.Mesh}[]=[];
  private clearWorld(){this.terrainTexture?.dispose();this.terrainTexture=undefined;this.world.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();const materials=Array.isArray(node.material)?node.material:[node.material];for(const material of materials)material.dispose();}else if(node instanceof THREE.Sprite)node.material.dispose();});this.world.clear();this.plants.length=0;this.streetLamps.length=0;this.houses.length=0;}
  private buildStreet(batch:Batches){
    batch.add(this.mesh(new THREE.BoxGeometry(65,.5,52),'#426d68',0,-.3,0));
    batch.add(this.mesh(new THREE.BoxGeometry(34,.12,22),'#777f91',0,-.08,0));
    const green=this.mesh(new THREE.CircleGeometry(1,32),'#4a8761',0,.015,0);green.rotation.x=-Math.PI/2;green.scale.set(6,3.5,1);batch.add(green);
    const water=this.mesh(new THREE.CircleGeometry(2,32),'#467f9b',0,.025,0);water.rotation.x=-Math.PI/2;batch.add(water);
    const rim=this.mesh(new THREE.RingGeometry(1.9,2.1,24),'#a5a4ae',0,.04,0);rim.rotation.x=-Math.PI/2;batch.add(rim);
    const colors=['#7f799b','#a67d68','#60958a','#8688ac','#a77b83','#6e8c98'];
    for(let i=1;i<=6;i++){const s=this.arena.solids[i],root=new THREE.Group(),house=new Batches(root,this.beams);this.world.add(root);this.houses.push({root,...s});
      const shadow=this.mesh(new THREE.PlaneGeometry(s.w+.7,s.d+.7),'#30445c',s.x,.05,s.z);shadow.rotation.x=-Math.PI/2;batch.add(shadow);
      house.add(this.mesh(new THREE.BoxGeometry(s.w,2.5,s.d),colors[i-1],s.x,1.25,s.z));
      const roof=this.mesh(new THREE.ConeGeometry(1,1.1,4),'#514e75',s.x,3.05,s.z);roof.rotation.y=Math.PI/4;roof.scale.set(s.w*.75,1,s.d*.75);house.add(roof);
      for(const dx of [-s.w*.27,s.w*.27]){house.add(this.mesh(new THREE.BoxGeometry(.7,.85,.05),'#ffc880',s.x+dx,1.45,s.z+s.d/2+.03));house.add(this.mesh(new THREE.BoxGeometry(.04,.85,.06),'#725e78',s.x+dx,1.45,s.z+s.d/2+.06));}
      house.add(this.mesh(new THREE.BoxGeometry(.65,1.4,.06),'#334866',s.x,.7,s.z+s.d/2+.04));house.finish();root.traverse(node=>{if(node instanceof THREE.Mesh){node.material.transparent=true;node.material.depthWrite=false;}});
    }
    for(let i=7;i<9;i++){const s=this.arena.solids[i],color=i===7?'#b37984':'#6c9ea3';batch.add(this.mesh(new THREE.BoxGeometry(s.w,.8,s.d),color,s.x,.65,s.z));batch.add(this.mesh(new THREE.BoxGeometry(2,.65,1.7),'#354a68',s.x,1.35,s.z));for(const dx of [-1.3,1.3])for(const dz of [-1,1]){const wheel=this.mesh(new THREE.CylinderGeometry(.38,.38,.18,8),'#26344b',s.x+dx,.38,s.z+dz);wheel.rotation.x=Math.PI/2;batch.add(wheel);}}
    for(let i=0;i<28;i++)for(const z of [-11.4,11.4])batch.add(this.prop('iron-fence',-17+i*1.25,z,1.6));
    for(let i=0;i<20;i++){const x=i%2?-18.2:18.2,z=-12+Math.floor(i/2)*2.7;batch.add(this.prop(i%3?'pine-fall':'pine',x,z,1.4+(i%3)*.2,i));}
    for(const [x,z] of [[0,-3],[-6,0],[6,0]]){batch.add(this.prop('lightpost-single',x,z,1.5));const halo=this.halo('#ffd277',3.4);halo.position.set(x,3.2,z);const pool=this.disc('#ffc873',3,.2);pool.position.set(x,.04,z);this.world.add(halo,pool);this.streetLamps.push({halo,pool});}
    this.lampHalo=this.streetLamps[0].halo;this.lampPool=this.streetLamps[0].pool;
    for(const p of this.arena.pads){batch.add(this.prop('pumpkin-carved',p.x,p.z,.9));const halo=this.halo('#ffb44f',1.8,.4);halo.position.set(p.x,.4,p.z);this.world.add(halo);this.plants.push(halo);}
    this.roof=this.mesh(new THREE.PlaneGeometry(1,1),'#514e75');this.roof.visible=false;this.world.add(this.roof);
  }
  private build(){this.buildWorld();
    for(let i=0;i<3;i++){const p=new THREE.Group();const body=this.mesh(new THREE.BoxGeometry(.55,.65,.35),'#ffd062',0,.6,0);this.beams.patch(body.material as THREE.MeshLambertMaterial);p.add(body,this.mesh(new THREE.BoxGeometry(.22,.11,.25),'#f7f2d5',0,.97,0));const plus=this.mesh(new THREE.BoxGeometry(.3,.07,.03),'#26345c',0,.63,.19);p.add(plus,this.mesh(new THREE.BoxGeometry(.07,.3,.03),'#26345c',0,.63,.19));const ring=this.disc('#ffd062',.65,.6);p.add(ring);const pillar=this.halo('#ffe08b',1.1,.35);pillar.scale.y=3;pillar.position.y=1.2;p.add(pillar);this.scene.add(p);this.pickups.push(p);}
    const flyGeometry=new THREE.BufferGeometry(),flyPositions=new Float32Array(60);for(let i=0;i<20;i++){flyPositions[i*3]=Math.sin(i*18.2)*12;flyPositions[i*3+1]=.6+(i%4)*.25;flyPositions[i*3+2]=Math.cos(i*8.7)*8;}flyGeometry.setAttribute('position',new THREE.BufferAttribute(flyPositions,3));this.fireflies=new THREE.Points(flyGeometry,new THREE.PointsMaterial({color:'#ffe7a0',size:.11,map:this.glow,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}));this.scene.add(this.fireflies);for(let i=0;i<6;i++){const torch=this.mesh(new THREE.CylinderGeometry(.1,.15,.55,6),'#334566');torch.visible=false;this.scene.add(torch);this.dropped.push({mesh:torch,until:0,born:0});}
    this.effects=new ChaseEffects(this.scene,this.glow);this.initialized=true;
  }
  private figure(e:Entity,local:boolean){const root=new THREE.Group(),color=palette[hash(e.id)%6],shadow=this.disc('#101b3a',.75,.5),marker=this.disc(color,.8,local?.6:.2);root.add(shadow,marker);marker.position.y=.04;
    let f:Figure={root,body:new THREE.Group(),role:e.role,moving:false,phase:0,last:{x:e.x,z:e.z},still:0,beam:new THREE.Group(),shadow,marker,born:performance.now(),stepAt:0};
    if(e.role==='kid'){
      const source=this.assets.get(`mini-characters/${KIDS[hash(e.id)%6]}`)!,model=cloneSkeleton(source.scene);model.updateMatrixWorld(true);model.traverse(node=>{if(node instanceof THREE.SkinnedMesh)node.skeleton.update();});box.setFromObject(model,true);const h=box.getSize(tmp).y;model.scale.setScalar(1.85/h);f.kidScale=model.scale.x;model.rotation.y=Math.PI;model.position.y=-box.min.y*model.scale.y;f.body=model;root.add(model);
      model.traverse(node=>{if(node instanceof THREE.Mesh){node.userData.sharedGeometry=true;const old=node.material as THREE.MeshStandardMaterial;node.material=this.beams.patch(new THREE.MeshLambertMaterial({map:old.map,color:old.color,side:THREE.DoubleSide,flatShading:true}),1,.65);}});
      const mixer=new THREE.AnimationMixer(model);f.mixer=mixer;f.idle=mixer.clipAction(source.animations.find(a=>a.name==='idle')!);f.run=mixer.clipAction(source.animations.find(a=>a.name==='sprint')!);f.idle.play();f.run.play().setEffectiveWeight(0);const holdClip=source.animations.find(a=>a.name==='holding-right')!.clone();holdClip.tracks=holdClip.tracks.filter(track=>track.name.includes('arm-right'));f.hold=mixer.clipAction(holdClip).play().setEffectiveWeight(0);
      const hand=model.getObjectByName('arm-right')!,torchGrip=new THREE.Group();torchGrip.position.set(0,-.08,-.04);torchGrip.scale.setScalar(1/model.scale.x);hand.add(torchGrip);const torch=this.mesh(new THREE.CylinderGeometry(.1,.1,.5,8),'#293a63');torch.rotation.x=Math.PI/2;torchGrip.add(torch);const lens=this.halo('#ffe8b0',.5,.8);lens.position.set(0,0,-.28);torchGrip.add(lens);
      // A cap badge preserves identity when converted, without relying on colour alone.
      const badge=this.mesh(new THREE.BoxGeometry(.45,.14,.4),color,0,1.84,0);root.add(badge);
    }else {
      const hips=new THREE.Group();hips.position.y=.7;root.add(hips);f.hips=hips;f.body=hips;const material=this.beams.patch(new THREE.MeshLambertMaterial({color:'#f2efe4',flatShading:true}),local?.85:.28,.23);f.gooseMaterial=material;const ice=new THREE.Group();const shell=new THREE.Mesh(new THREE.IcosahedronGeometry(1.05,0),new THREE.MeshBasicMaterial({color:'#c2f1ff',wireframe:true,transparent:true,opacity:.35}));shell.position.y=.95;shell.scale.set(.8,1.05,1.16);ice.add(shell);const ring=new THREE.Mesh(new THREE.RingGeometry(.9,.98,40),new THREE.MeshBasicMaterial({color:'#b9ecff'}));ring.rotation.x=-Math.PI/2;ring.position.y=.09;ice.add(ring);root.add(ice);f.ice=ice;const shield=new THREE.Mesh(new THREE.RingGeometry(.95,1.03,12,1,0,Math.PI*1.6),new THREE.MeshBasicMaterial({color:'#d1daef',side:THREE.DoubleSide,transparent:true,opacity:.6}));shield.rotation.x=-Math.PI/2;shield.position.y=.06;const emblem=new THREE.BufferGeometry();emblem.setAttribute('position',new THREE.Float32BufferAttribute([-.16,.18,0,.16,.18,0,.14,-.08,0,0,-.2,0,-.14,-.08,0],3));emblem.setIndex([0,1,2,0,2,3,0,3,4]);const badgeShield=new THREE.Mesh(emblem,new THREE.MeshBasicMaterial({color:'#e9f3ff',side:THREE.DoubleSide}));badgeShield.rotation.x=Math.PI/2;badgeShield.position.set(0,0,1.1);shield.add(badgeShield);root.add(shield);f.shield=shield;
      const tell=new THREE.Group(),stripe=new THREE.Mesh(new THREE.PlaneGeometry(.8,TUNE.dashDistance),new THREE.MeshBasicMaterial({color:'#ff628b',transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false}));stripe.rotation.x=-Math.PI/2;stripe.position.set(0,.08,TUNE.dashDistance/2+.4);tell.add(stripe);const tip=new THREE.Mesh(new THREE.CircleGeometry(.55,3),new THREE.MeshBasicMaterial({color:'#ffe2e9',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));tip.rotation.set(-Math.PI/2,0,Math.PI);tip.position.set(0,.09,TUNE.dashDistance+.3);tell.add(tip);root.add(tell);f.tell=tell;
      const stars=new THREE.Group();for(let i=0;i<5;i++){const star=new THREE.Mesh(new THREE.OctahedronGeometry(.12),new THREE.MeshBasicMaterial({color:'#ffe397'}));star.position.set(Math.sin(i*Math.PI*.4)*.55,2.2,Math.cos(i*Math.PI*.4)*.55);stars.add(star);}root.add(stars);f.stars=stars;
      const part=(g:THREE.BufferGeometry,x:number,y:number,z:number)=>{const m=new THREE.Mesh(g,material);m.position.set(x,y,z);hips.add(m);return m;};
      const body=part(new THREE.SphereGeometry(.6,10,7),0,0,0);body.scale.set(1,.8,1.4);const tail=part(new THREE.ConeGeometry(.25,.5,5),0,.1,-.8);tail.rotation.x=-.8;
      f.wings=[-1,1].map(sign=>{const pivot=new THREE.Group();pivot.position.set(sign*.52,.14,.1);hips.add(pivot);const wing=new THREE.Mesh(new THREE.SphereGeometry(.4,7,5),material);wing.scale.set(.25,.5,1.3);wing.position.z=-.15;pivot.add(wing);return pivot;});
      const neck=new THREE.Group();neck.position.set(0,.15,.5);hips.add(neck);f.neck=neck;const n=new THREE.Mesh(new THREE.CylinderGeometry(.14,.21,.9,7),material);n.position.y=.45;neck.add(n);const head=new THREE.Mesh(new THREE.SphereGeometry(.28,8,6),material);head.position.set(0,.98,.08);neck.add(head);
      const beak=this.mesh(new THREE.ConeGeometry(.17,.5,4),'#ff9a37',0,.96,.43);beak.rotation.x=Math.PI/2;neck.add(beak);const cap=this.mesh(new THREE.BoxGeometry(.4,.13,.38),color,0,1.23,.07);neck.add(cap);
      const eyes=new THREE.Group();neck.add(eyes);f.eyes=eyes;for(const sign of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.065,6,4),new THREE.MeshBasicMaterial({color:'#ffe4e9',fog:false}));eye.position.set(sign*.21,1.04,.26);eyes.add(eye);const halo=this.halo('#ff2e57',.5,.9);halo.position.copy(eye.position);eyes.add(halo);}
      const brows=new THREE.Group();eyes.add(brows);f.brows=brows;for(const sign of [-1,1]){const brow=this.mesh(new THREE.BoxGeometry(.18,.045,.055),'#401b42',sign*.2,1.14,.3);brow.rotation.z=sign*-.3;brows.add(brow);}
      f.legs=[-1,1].map(sign=>{const leg=new THREE.Group();leg.position.set(sign*.28,-.28,.1);hips.add(leg);const foot=this.mesh(new THREE.ConeGeometry(.21,.3,3),'#ff9a37',0,-.32,.12);foot.rotation.x=Math.PI/2;leg.add(foot);return leg;});
      root.scale.setScalar(1.25);
    }
    const coneGeo=new THREE.CylinderGeometry(.02,Math.tan(TUNE.halfCone)*7,7,20,5,true);coneGeo.translate(0,-3.5,0);coneGeo.rotateX(-Math.PI/2);
    const coneMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{color:{value:new THREE.Color('#ffe2a8')}},vertexShader:'varying float along;void main(){along=position.z/7.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 color;varying float along;void main(){float a=0.075*pow(clamp(1.0-along,0.0,1.0),1.5);gl_FragColor=vec4(color,a);}'});
    f.beam.add(new THREE.Mesh(coneGeo,coneMat));this.scene.add(f.beam,root);this.figures.set(e.id,f);return f;
  }
  render(now:number,snapshot:ChaseSnapshot|undefined,id:string,local:Point,position:(e:Entity)=>Point,torchColor:string){const dt=Math.min(.1,(now-this.previous)/1000||.016);this.previous=now;if(this.initialized&&arenaFor(snapshot?.arena)!==this.arena){this.arena=arenaFor(snapshot?.arena);this.clearWorld();this.buildWorld();this.focus.set(0,0,0);}if(!this.initialized){this.renderer.render(this.scene,this.camera);return;}
    let entities=snapshot?.entities;if(!entities){if(!this.titleEntities.length){for(let i=0;i<3;i++)this.titleEntities.push({id:`title-${i}`,role:i===2?'goose':'kid',personality:i,name:'',x:0,z:0,facing:0,aim:0,battery:100,light:i<2,held:i<2,bot:true,vx:2,vz:0,frozenUntil:0,immuneUntil:0,safeUntil:0,score:0,lungeAt:-10,lungeAngle:0,lungeHit:false,lastLight:0,dwell:{},touch:{}});}entities=this.titleEntities;for(let i=0;i<3;i++){const e=entities[i],t=now*.00025+i*1.5;e.x=Math.sin(t)*5;e.z=5.5+Math.cos(t)*1.15;e.facing=Math.atan2(Math.cos(t)*5,-Math.sin(t)*1.15);e.aim=e.facing+.4*Math.sin(now*.0007);}}
    if(snapshot){const run=snapshot.solo?.runId??snapshot.multi?.runId??'';if(run!==this.eventRun){this.lastEvent=this.eventRun?0:snapshot.events.at(-1)?.id??0;this.eventRun=run;}for(const event of snapshot.events)if(event.id>this.lastEvent){this.lastEvent=event.id;this.effects?.event(event);if(event.type==='dawn')this.dawnAt=now;if(event.type==='catch'){const drop=this.dropped[this.dropCursor++%this.dropped.length];if(drop){drop.born=now;drop.until=now+1000;drop.mesh.position.set(event.x,1,event.z);drop.mesh.visible=true;}for(const who of [event.actor,event.target]){const figure=who?this.figures.get(who):undefined;if(figure){figure.holdUntil=now+90;figure.holdAt={...figure.last};figure.holdFacing=figure.root.rotation.y;if(who===event.target&&figure.role==='kid')figure.convertUntil=now+190;if(who===event.actor){figure.recoilUntil=now+650;figure.recoilFacing=figure.root.rotation.y;}}}if(event.actor===id||event.target===id){this.trauma=Math.min(1,this.trauma+.6);this.punchUntil=now+250;}}if(event.type==='miss'){const f=this.figures.get(event.actor);if(f)f.starsUntil=now+500;}if(event.type==='near'){const f=event.target?this.figures.get(event.target):undefined;if(f)f.slowUntil=now+80;}if(event.type==='freeze'&&event.actor===id)this.trauma=Math.min(1,this.trauma+.18);}}
    for(const e of entities){const p=snapshot?e.id===id?local:position(e):e;let draw=this.drawPositions.get(e.id);if(!draw){draw={x:0,z:0};this.drawPositions.set(e.id,draw);}draw.x=p.x;draw.z=p.z;}for(const key of this.drawPositions.keys())if(!entities.some(e=>e.id===key))this.drawPositions.delete(key);
    this.viewProjection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.viewProjection);this.animationFrame++;
    this.beams.update(entities,this.drawPositions,torchColor,now,this.arena);
    for(const [key,f] of this.figures)if(!entities.some(e=>e.id===key&&(e.role===f.role||(f.convertUntil??0)>now))){this.scene.remove(f.root,f.beam);f.mixer?.stopAllAction();f.mixer?.uncacheRoot(f.body);f.root.traverse(n=>{if(n instanceof THREE.SkinnedMesh)n.skeleton.dispose();if(n instanceof THREE.Sprite)n.material.dispose();if(n instanceof THREE.Mesh){if(!n.userData.sharedGeometry)n.geometry.dispose();if(Array.isArray(n.material))n.material.forEach(m=>{if(m!==this.beams.keepAlive)m.dispose();});else if(n.material!==this.beams.keepAlive)n.material.dispose();}});f.beam.traverse(n=>{if(n instanceof THREE.Mesh){n.geometry.dispose();n.material.dispose();}});this.figures.delete(key);}
    for(const e of entities){const f=this.figures.get(e.id)??this.figure(e,e.id===id),p=(f.holdUntil??0)>now?f.holdAt!:this.drawPositions.get(e.id)!,moved=distance(p,f.last),speed=Math.min(9,moved/Math.max(dt,.001)),dawnWalk=e.role==='goose'&&snapshot?.phase==='results'&&snapshot.events.some(event=>event.type==='dawn'),moving=speed>.1||dawnWalk,time=snapshot?.now??now/1000,frozen=e.frozenUntil>time,t=time-e.lungeAt;
      if(moving&&!frozen&&now-f.stepAt>170){this.effects?.burst(p.x,p.z,1,false,'#7789b5');f.stepAt=now;}f.phase+=moved*8+(dawnWalk?dt*7:0);f.still=moving?0:f.still+dt;f.root.position.set(p.x,0,p.z+(dawnWalk?Math.min(7,Math.max(0,(now-this.dawnAt)/1000))*1.3:0));f.root.rotation.y=(f.holdUntil??0)>now?f.holdFacing!:e.facing;if(dawnWalk)f.root.rotation.y=0;const recoil=Math.max(0,((f.recoilUntil??0)-now)/650)*1.15;if(recoil){f.root.position.x-=Math.sin(f.recoilFacing??0)*recoil;f.root.position.z-=Math.cos(f.recoilFacing??0)*recoil;}f.last.x=p.x;f.last.z=p.z;f.marker.visible=e.id===id||snapshot?.multi?.lastKid===e.id;f.marker.scale.setScalar(snapshot?.multi?.lastKid===e.id?1.3+Math.sin(now*.006)*.08:1);f.shadow.scale.setScalar(moving?.95:1);
      if(f.mixer){f.hold!.setEffectiveWeight(e.light?.85:0);f.run!.setEffectiveWeight(moving?1:0);f.run!.setEffectiveTimeScale(Math.max(.5,speed/3.3));f.idle!.setEffectiveWeight(moving?0:1);if(!frozen&&(f.holdUntil??0)<=now){const far=distance(p,local)>20,visible=e.id===id||this.frustum.containsPoint(tmp.set(p.x,1,p.z));if(visible&&(!far||this.animationFrame%2===0))f.mixer.update(dt*(far?2:1)*((f.slowUntil??0)>now?.2:1));};if(f.convertUntil&&f.kidScale){const squash=Math.max(0,Math.min(1,1-(f.convertUntil-now)/100));f.body.scale.set(f.kidScale*(1+squash*.3),f.kidScale*(1-squash*.7),f.kidScale*(1+squash*.3));}f.body.position.y=moving?Math.abs(Math.sin(f.phase))*.08:Math.sin(now*.003)*.025;}
      if(f.gooseMaterial){const lit=entities.some(k=>k.role==='kid'&&k.light&&distance(this.drawPositions.get(k.id)!,p)<TUNE.range&&Math.abs(angleDelta(k.aim,angleTo(this.drawPositions.get(k.id)!,p)))<TUNE.halfCone&&clearPath(this.drawPositions.get(k.id)!,p,this.arena,0,true));if(lit)f.revealUntil=now+400;const revealed=(f.revealUntil??0)>now;if(lit&&!frozen&&e.immuneUntil<=time&&now-(f.sparkAt??0)>65){this.effects?.burst(p.x,p.z,2,false,'#ffdf94');f.sparkAt=now;}const icy=frozen&&e.safeUntil<=time;f.gooseMaterial.userData.ddgAmbient.value=icy?1:e.id===id?.85:revealed?.7:.28;f.gooseMaterial.color.set(icy?'#bdeaff':'#f2efe4');f.ice!.visible=icy;const ring=f.ice!.children[1] as THREE.Mesh;ring.geometry.setDrawRange(0,Math.max(0,Math.ceil(Math.min(1,(e.frozenUntil-time)/TUNE.freeze)*40))*6);f.tell!.visible=t>=0&&t<TUNE.windup&&!frozen;f.tell!.rotation.y=e.lungeAngle-e.facing;f.stars!.visible=(f.starsUntil??0)>now;f.stars!.rotation.y=now*.008;f.shield!.visible=e.immuneUntil>time&&!frozen;const age=(now-f.born)/1000,progress=Math.min(1,age/.4),pop=age<.4?.3+.7*(1-(1-progress)**3)+.2*Math.sin(progress*Math.PI):1;f.root.scale.setScalar(1.25*pop);const hop=age<.4?Math.sin(progress*Math.PI)*.55:0;f.root.position.y=hop;f.shadow.position.y=.035-hop;f.marker.position.y=.04-hop;}
      if(f.hips&&(f.holdUntil??0)<=now){const dash=t>=0&&t<.84;f.hips.rotation.z=frozen?0:Math.sin(f.phase)*.14*(moving?1:.1);f.hips.rotation.x=dash?.25:0;f.hips.position.y=.7+(frozen?0:Math.abs(Math.sin(f.phase))*.06);f.neck!.rotation.x=dash?(t<.12?-.45:t<.34?1.05:.4):-Math.sin(f.phase*2)*.07;f.wings!.forEach((w,i)=>w.rotation.z=(i?1:-1)*(dash?.8:Math.sin(f.phase)*.15));f.legs!.forEach((l,i)=>l.rotation.x=frozen?0:Math.sin(f.phase+(i?Math.PI:0))*.5);f.eyes!.visible=f.still<.6||dash||e.id===id||frozen||!!snapshot?.multi?.lastKid;f.brows!.visible=!!snapshot?.multi?.lastKid;const blink=!frozen&&!dash&&Math.sin(now*.0015+f.born)>.996;f.eyes!.scale.setScalar(dash&&t<TUNE.windup?1.65:1);f.eyes!.scale.y*=frozen?.5:blink?.08:1;}
      f.beam.visible=e.role==='kid'&&e.light&&(e.battery>=25||Math.sin(now*.025)>-.75);if(f.beam.visible&&now-(f.moteAt??0)>100){const d=1+Math.random()*5;this.effects?.burst(p.x+Math.sin(e.aim)*d,p.z+Math.cos(e.aim)*d,1,false,'#ffdda3');f.moteAt=now;}f.beam.position.set(p.x,1.3,p.z);f.beam.rotation.set(-.14,e.aim,0,'YXZ');
    }
    this.pickups.forEach((root,i)=>{const p=snapshot?.pickups[i];root.visible=!!p&&p.readyAt<=snapshot!.now;if(p){root.position.set(p.x,.12+Math.sin(now*.003+i)*.1,p.z);root.rotation.y=now*.0015;}});
    for(const house of this.houses){const fade=Math.abs(local.x-house.x)<house.w/2+1.2&&local.z<house.z+house.d/2+1&&local.z>house.z-house.d/2-10;house.root.traverse(node=>{if(node instanceof THREE.Mesh)(node.material as THREE.Material).opacity=fade?.18:1;});}
    const active=!snapshot||!!snapshot.lamps?.[0]?.active,dying=active&&snapshot&&(snapshot.lamps?.[0]?.remaining??5)<1.5,flicker=dying&&Math.sin(now*.035)<0?.25:1;this.lampHalo.material.opacity=(active?.65:.12)*flicker;(this.lampPool.material as THREE.MeshBasicMaterial).opacity=.2*flicker;this.lampPool.visible=active;this.plants.forEach((p,i)=>{(p as THREE.Sprite).material.opacity=.4+Math.sin(now*.002+i)*.1;});
    for(let i=1;i<this.streetLamps.length;i++){const lamp=snapshot?.lamps?.[i],item=this.streetLamps[i];item.halo.material.opacity=lamp?.active?.65:.12;item.pool.visible=!!lamp?.active;}
    for(const drop of this.dropped){drop.mesh.visible=now<drop.until;if(drop.mesh.visible){const age=(now-drop.born)/1000;drop.mesh.position.y=Math.max(.12,1+age*1.5-age*4);drop.mesh.rotation.set(age*9,age*5,age*6);drop.mesh.scale.setScalar(Math.min(1,(1-age)*4));}}if(this.fireflies){const positions=this.fireflies.geometry.getAttribute('position');for(let i=0;i<20;i++){positions.setY(i,.8+Math.sin(now*.001+i*2)*.35);positions.setX(i,Math.sin(i*18.2)*12+Math.sin(now*.0004+i)*.4);}positions.needsUpdate=true;}const dawn=!!snapshot&&snapshot.phase==='results'&&snapshot.events.some(e=>e.type==='dawn'),firstLight=!!snapshot?.multi&&snapshot.elapsed>=60;this.moon.color.lerp(this.targetColor.set(dawn?'#ffd78e':firstLight?'#e2c1d9':'#a5c5ff'),1-Math.exp(-dt));(this.scene.background as THREE.Color).lerp(this.targetColor.set(dawn?'#8e7192':firstLight?'#514671':'#23396b'),1-Math.exp(-dt));if(dawn)for(const f of this.figures.values())if(f.eyes)f.eyes.visible=false;
    const me=entities.find(e=>e.id===id),goal=me?local:{x:0,z:4};const look=this.look.set(me?me.vx*.25:0,0,me?me.vz*.25:0);look.clampLength(0,2);this.ahead.lerp(look,1-Math.exp(-dt*2.5));const gx=THREE.MathUtils.clamp(goal.x+this.ahead.x,-this.arena.width/2+4,this.arena.width/2-4),gz=THREE.MathUtils.clamp(goal.z-1.5+this.ahead.z,-this.arena.depth/2+3,this.arena.depth/2-3);if(!this.focus.lengthSq())this.focus.set(gx,0,gz);this.focus.lerp(tmp.set(gx,0,gz),1-Math.exp(-dt*8));
    const d=snapshot?(innerHeight<600?16:18):21.5,angle=47*Math.PI/180;this.camera.position.set(this.focus.x,Math.sin(angle)*d,this.focus.z+Math.cos(angle)*d);this.camera.lookAt(this.focus);const fov=35*(1-.07*(this.reduced?.3:1)*Math.max(0,(this.punchUntil-now)/250)**3);if(Math.abs(this.camera.fov-fov)>.0001){this.camera.fov=fov;this.camera.updateProjectionMatrix();}this.trauma=Math.max(0,this.trauma-dt*1.4);const shake=this.trauma*this.trauma*(this.reduced?.08:.3);this.camera.position.x+=Math.sin(now*.077)*shake;this.camera.position.y+=Math.cos(now*.091)*shake;this.effects?.update(dt,this.camera);(this.roof.material as THREE.Material).opacity=me&&Math.abs(local.x)<4&&local.z<2?.32:1;
    const hitStop=now<this.punchUntil-160;if(this.quality.frame(now,!snapshot,document.hidden||hitStop)){this.renderer.setPixelRatio(this.quality.ratio);this.resize();}this.effects?.setLimit(this.quality.tier==='low'?96:256);
    if(this.fireflies)this.fireflies.visible=this.quality.tier!=='low';if(this.quality.tier==='low')for(const [key,f] of this.figures)if(key!==id)f.beam.visible=false;
    if(!document.hidden)this.renderer.render(this.scene,this.camera);
  }
}
