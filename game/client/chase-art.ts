import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {PARK,TUNE,clearPath,distance,type Entity,type Point,type ChaseSnapshot} from '../shared/chase';

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
  pos=Array.from({length:6},()=>new THREE.Vector4());
  dir=Array.from({length:6},()=>new THREE.Vector4());
  tint=Array.from({length:6},()=>new THREE.Vector4());
  patch(material:THREE.MeshLambertMaterial,ambient=1,rim=.08){
    material.onBeforeCompile=shader=>{
      shader.uniforms.ddgPos={value:this.pos};shader.uniforms.ddgDir={value:this.dir};shader.uniforms.ddgTint={value:this.tint};
      shader.vertexShader='varying vec3 ddgWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nddgWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader='varying vec3 ddgWorld;\nuniform vec4 ddgPos[6];\nuniform vec4 ddgDir[6];\nuniform vec4 ddgTint[6];\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        outgoingLight *= ${ambient.toFixed(3)};
        for(int i=0;i<6;i++){
          vec3 delta=ddgWorld-ddgPos[i].xyz;float d=length(delta);
          float cone=smoothstep(ddgDir[i].w,0.989,dot(normalize(delta),ddgDir[i].xyz));
          float fall=pow(clamp(1.0-d/max(ddgPos[i].w,0.01),0.0,1.0),1.2);
          outgoingLight+=diffuseColor.rgb*ddgTint[i].rgb*ddgTint[i].a*cone*fall*2.6;
        }
        outgoingLight+=vec3(0.19,0.26,0.48)*pow(1.0-abs(normal.z),2.5)*${rim.toFixed(3)};
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>`ddg-beams-${ambient}-${rim}`;return material;
  }
  color(color:string){return this.patch(new THREE.MeshLambertMaterial({color,flatShading:true,vertexColors:true}));}
  update(entities:Entity[],positions:Map<string,Point>,color:string){let slot=0;
    for(const e of entities){if(e.role!=='kid'||!e.light||slot===6)continue;const p=positions.get(e.id)??e;let range:number=TUNE.range;
      // Match the rule's occluders, shortening the visual beam at its centre ray.
      for(let d=.5;d<=TUNE.range;d+=.3){if(!clearPath(p,{x:p.x+Math.sin(e.aim)*d,z:p.z+Math.cos(e.aim)*d},PARK,0,true)){range=d;break;}}
      this.pos[slot].set(p.x,1.3,p.z,range);this.dir[slot].set(Math.sin(e.aim)*.988,-.155,Math.cos(e.aim)*.988,Math.cos(TUNE.halfCone));
      const c=new THREE.Color(color);this.tint[slot].set(c.r,c.g,c.b,1);slot++;
    }for(;slot<6;slot++)this.tint[slot].w=0;
  }
}

/** Static geometry is merged by texture pack, with source material colours baked. */
class Batches {
  groups=new Map<string,{material:THREE.MeshLambertMaterial;geometries:THREE.BufferGeometry[]}>();
  constructor(private scene:THREE.Scene,private beams:BeamMaterials){}
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

interface Figure {root:THREE.Group;body:THREE.Object3D;role:Entity['role'];mixer?:THREE.AnimationMixer;idle?:THREE.AnimationAction;run?:THREE.AnimationAction;hold?:THREE.AnimationAction;moving:boolean;phase:number;last:Point;hips?:THREE.Group;neck?:THREE.Group;wings?:THREE.Group[];legs?:THREE.Group[];eyes?:THREE.Group;still:number;beam:THREE.Group;shadow:THREE.Mesh;marker:THREE.Mesh}

export class ChaseArt {
  readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(35,1,.4,100);
  readonly renderer:THREE.WebGLRenderer;
  readonly ready:Promise<void>;
  private assets=new Map<string,GLTF>();private beams=new BeamMaterials();private figures=new Map<string,Figure>();
  private glow=radial();private focus=new THREE.Vector3();private ahead=new THREE.Vector3();private initialized=false;private previous=0;
  private drawPositions=new Map<string,Point>();private pickups:THREE.Group[]=[];private roof!:THREE.Mesh;private lampHalo!:THREE.Sprite;private lampPool!:THREE.Mesh;
  private plants:THREE.Object3D[]=[];private titleEntities:Entity[]=[];
  constructor(canvas:HTMLCanvasElement){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NeutralToneMapping;
    this.scene.background=new THREE.Color('#23396b');this.scene.fog=new THREE.FogExp2('#293c70',.016);
    this.scene.add(new THREE.HemisphereLight('#8ca6ec','#3a375f',2.5));const moon=new THREE.DirectionalLight('#a5c5ff',1.8);moon.position.set(-12,20,8);this.scene.add(moon);
    canvas.setAttribute('aria-busy','true');this.ready=this.load().then(()=>{this.build();canvas.setAttribute('aria-busy','false');});this.resize();
  }
  resize(){this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
  private async load(){const loader=new GLTFLoader();await Promise.all([...KIDS.map(n=>`mini-characters/${n}`),...PROPS.map(n=>`graveyard-kit/${n}`),...NATURE.map(n=>`nature-kit/${n}`)].map(async path=>{this.assets.set(path,await loader.loadAsync(`${ROOT}${path}.glb`));}));}
  private mesh(geometry:THREE.BufferGeometry,color:string,x=0,y=0,z=0){const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color,flatShading:true}));mesh.position.set(x,y,z);return mesh;}
  private prop(name:string,x:number,z:number,scale=1,angle=0,pack='graveyard-kit'){const model=this.assets.get(`${pack}/${name}`)!.scene.clone();model.position.set(x,0,z);model.scale.setScalar(scale);model.rotation.y=angle;model.userData.texturePack=pack;return model;}
  private halo(color:string,size:number,opacity=.6){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color,transparent:true,opacity,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));sprite.scale.setScalar(size);return sprite;}
  private disc(color:string,radius:number,opacity:number){const m=new THREE.Mesh(new THREE.PlaneGeometry(radius*2,radius*2),new THREE.MeshBasicMaterial({map:this.glow,color,transparent:true,opacity,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.y=.035;return m;}
  private build(){const batch=new Batches(this.scene,this.beams);
    batch.add(this.mesh(new THREE.BoxGeometry(60,.5,50),'#426d68',0,-.3,0));
    batch.add(this.mesh(new THREE.BoxGeometry(26,.14,18),'#4a8761',0,-.09,0));
    // Paths wrap the same server rectangles; flat paint never introduces collision.
    for(const z of [-6.3,6.3])batch.add(this.mesh(new THREE.BoxGeometry(26,.06,2.2),'#898392',0,.015,z));
    for(const x of [-10.7,10.7,-4.4,4.4])batch.add(this.mesh(new THREE.BoxGeometry(x*x>50?2:1.8,.05,18),'#898392',x,.02,0));
    for(let i=0;i<130;i++){const x=Math.sin(i*17.3)*12.7,z=Math.cos(i*8.21)*8.7;const patch=this.mesh(new THREE.CircleGeometry(.08+(i%4)*.055,5),['#b69954','#d89c4c','#af7844','#587c66'][i%4],x,.065,z);patch.rotation.x=-Math.PI/2;patch.rotation.z=i;batch.add(patch);}
    for(const s of PARK.solids.slice(1)){batch.add(this.mesh(new THREE.BoxGeometry(s.w,.4,s.d),'#305c59',s.x,.2,s.z));
      const alongX=s.w>s.d,count=Math.ceil(Math.max(s.w,s.d)/.65);for(let i=0;i<count;i++){const t=(i-(count-1)/2)*.65;const bush=this.prop(i%2?'plant_bush':'plant_bushSmall',s.x+(alongX?t:0),s.z+(alongX?0:t),1,0,'nature-kit');box.setFromObject(bush);const sz=box.getSize(tmp);bush.scale.multiplyScalar(.95/Math.max(sz.x,sz.z));bush.position.y=.4;batch.add(bush);const crown=this.mesh(new THREE.DodecahedronGeometry(.52,0),i%2?'#4e815b':'#63865a',bush.position.x,.61,bush.position.z);crown.scale.y=.85;batch.add(crown);}}
    // Low open bandstand: its deck exactly describes the existing central solid.
    batch.add(this.mesh(new THREE.BoxGeometry(5.8,.65,5.8),'#7c7390',0,.3,0));batch.add(this.mesh(new THREE.BoxGeometry(5.55,.16,5.55),'#b0a09a',0,.7,0));
    for(const x of [-2.3,2.3])for(const z of [-2.3,2.3])batch.add(this.mesh(new THREE.CylinderGeometry(.12,.15,2.4,6),'#b4bbc5',x,1.9,z));
    this.roof=this.mesh(new THREE.ConeGeometry(4.1,1.2,4),'#625887',0,3.65,0);this.roof.rotation.y=Math.PI/4;const rm=this.roof.material as THREE.MeshLambertMaterial;this.beams.patch(rm);rm.transparent=true;this.scene.add(this.roof);
    for(const [x,z] of [[-2.3,2.3],[2.3,2.3],[-2.3,-2.3],[2.3,-2.3]]){batch.add(this.prop('pumpkin-carved',x,z,1.4));const glow=this.halo('#ffb34f',1.7,.4);glow.position.set(x,.4,z);this.scene.add(glow);}
    // Everything tall stays outside the playable bounds or inside the existing solids.
    for(let i=0;i<36;i++){const side=i%4,t=Math.floor(i/4),x=side<2?-14.4+t*3.4:side===2?-14.5:14.5,z=side<2?side===0?-10.5:10.6:-9+t*2.5;batch.add(this.prop(i%4===0?'pine':i%3?'pine-fall':'pine-fall-crooked',x,z,1.4+(i%3)*.25,i*.7));}
    for(let i=0;i<22;i++)for(const z of [-9.6,9.6])batch.add(this.prop('iron-fence',-13+i*1.25,z,1.6));
    for(const x of [-1.7,1.7]){const bench=this.prop('bench',x,0,2.1,x>0?-Math.PI/2:Math.PI/2);bench.position.y=.8;batch.add(bench);}batch.add(this.prop('hay-bale',-13.8,4,2.1));
    for(let i=0;i<16;i++){const x=i%2?12.95:-12.95,z=-8+i*1.05;batch.add(this.prop('pumpkin-tall-carved',x,z,.9+(i%3)*.18,i));batch.add(this.prop('mushroom_tanGroup',x+(i%2?.6:-.6),z+.5,.8,0,'nature-kit'));}
    for(const [x,z] of [[-6,3.3],[6,-3.3],[-8,-3.5],[8,3.5]]){const pumpkin=this.prop('pumpkin-carved',x,z,1.6);pumpkin.position.y=.4;batch.add(pumpkin);const warm=this.halo('#ffc36b',1.6,.5);warm.position.set(x,.8,z);this.scene.add(warm);const spill=this.disc('#e5a34f',1.3,.23);spill.position.x=x;spill.position.z=z;this.scene.add(spill);}
    for(const x of [-2.9,2.9])for(const z of [-2.9,2.9]){const end=new THREE.Vector3(x,3.1,z),start=new THREE.Vector3(0,4.25,0),delta=end.clone().sub(start);const rib=this.mesh(new THREE.CylinderGeometry(.035,.045,delta.length(),5),'#a29abb');rib.position.copy(start.add(end).multiplyScalar(.5));rib.quaternion.setFromUnitVectors(unit,delta.normalize());batch.add(rib);}
    const ceiling=this.halo('#ffcc76',3.5,.45);ceiling.position.set(0,1.8,0);this.scene.add(ceiling);
    const lamp=this.prop('lightpost-single',-3.8,0,1.5);batch.add(lamp);this.lampHalo=this.halo('#ffd277',3.4);this.lampHalo.position.set(-3.8,3.2,0);this.scene.add(this.lampHalo);this.lampPool=this.disc('#ffc873',3,.2);this.lampPool.position.x=-3.8;this.scene.add(this.lampPool);
    for(let i=0;i<6;i++){const p=this.prop('lantern-glass',i%2?14:-14,-8+i*3.1,1.5);batch.add(p);const glow=this.halo('#ffb44f',2.5,.55);glow.position.copy(p.position);glow.position.y=.6;this.scene.add(glow);this.plants.push(glow);}
    batch.finish();
    for(let i=0;i<2;i++){const p=new THREE.Group();const body=this.mesh(new THREE.BoxGeometry(.55,.65,.35),'#ffd062',0,.6,0);this.beams.patch(body.material as THREE.MeshLambertMaterial);p.add(body,this.mesh(new THREE.BoxGeometry(.22,.11,.25),'#f7f2d5',0,.97,0));const plus=this.mesh(new THREE.BoxGeometry(.3,.07,.03),'#26345c',0,.63,.19);p.add(plus,this.mesh(new THREE.BoxGeometry(.07,.3,.03),'#26345c',0,.63,.19));const ring=this.disc('#ffd062',.65,.6);p.add(ring);this.scene.add(p);this.pickups.push(p);}
    this.initialized=true;
  }
  private figure(e:Entity,local:boolean){const root=new THREE.Group(),color=palette[hash(e.id)%6],shadow=this.disc('#101b3a',.75,.5),marker=this.disc(color,.8,local?.6:.2);root.add(shadow,marker);marker.position.y=.04;
    let f:Figure={root,body:new THREE.Group(),role:e.role,moving:false,phase:0,last:{x:e.x,z:e.z},still:0,beam:new THREE.Group(),shadow,marker};
    if(e.role==='kid'){
      const source=this.assets.get(`mini-characters/${KIDS[hash(e.id)%6]}`)!,model=cloneSkeleton(source.scene);model.updateMatrixWorld(true);model.traverse(node=>{if(node instanceof THREE.SkinnedMesh)node.skeleton.update();});box.setFromObject(model,true);const h=box.getSize(tmp).y;model.scale.setScalar(1.85/h);model.rotation.y=Math.PI;model.position.y=-box.min.y*model.scale.y;f.body=model;root.add(model);
      model.traverse(node=>{if(node instanceof THREE.Mesh){node.userData.sharedGeometry=true;const old=node.material as THREE.MeshStandardMaterial;node.material=this.beams.patch(new THREE.MeshLambertMaterial({map:old.map,color:old.color,side:THREE.DoubleSide,flatShading:true}),1,.65);}});
      const mixer=new THREE.AnimationMixer(model);f.mixer=mixer;f.idle=mixer.clipAction(source.animations.find(a=>a.name==='idle')!);f.run=mixer.clipAction(source.animations.find(a=>a.name==='sprint')!);f.idle.play();f.run.play().setEffectiveWeight(0);
      const torch=this.mesh(new THREE.CylinderGeometry(.1,.1,.5,8),'#293a63',.55,1.1,.25);torch.rotation.x=Math.PI/2;root.add(torch);const lens=this.halo('#ffe8b0',.5,.8);lens.position.set(.55,1.1,.5);root.add(lens);
      // A cap badge preserves identity when converted, without relying on colour alone.
      const badge=this.mesh(new THREE.BoxGeometry(.45,.14,.4),color,0,1.84,0);root.add(badge);
    }else {
      const hips=new THREE.Group();hips.position.y=.7;root.add(hips);f.hips=hips;f.body=hips;const material=this.beams.patch(new THREE.MeshLambertMaterial({color:'#f2efe4',flatShading:true}),local?.85:.28,.23);
      const part=(g:THREE.BufferGeometry,x:number,y:number,z:number)=>{const m=new THREE.Mesh(g,material);m.position.set(x,y,z);hips.add(m);return m;};
      const body=part(new THREE.SphereGeometry(.6,10,7),0,0,0);body.scale.set(1,.8,1.4);const tail=part(new THREE.ConeGeometry(.25,.5,5),0,.1,-.8);tail.rotation.x=-.8;
      f.wings=[-1,1].map(sign=>{const pivot=new THREE.Group();pivot.position.set(sign*.52,.14,.1);hips.add(pivot);const wing=new THREE.Mesh(new THREE.SphereGeometry(.4,7,5),material);wing.scale.set(.25,.5,1.3);wing.position.z=-.15;pivot.add(wing);return pivot;});
      const neck=new THREE.Group();neck.position.set(0,.15,.5);hips.add(neck);f.neck=neck;const n=new THREE.Mesh(new THREE.CylinderGeometry(.14,.21,.9,7),material);n.position.y=.45;neck.add(n);const head=new THREE.Mesh(new THREE.SphereGeometry(.28,8,6),material);head.position.set(0,.98,.08);neck.add(head);
      const beak=this.mesh(new THREE.ConeGeometry(.17,.5,4),'#ff9a37',0,.96,.43);beak.rotation.x=Math.PI/2;neck.add(beak);const cap=this.mesh(new THREE.BoxGeometry(.4,.13,.38),color,0,1.23,.07);neck.add(cap);
      const eyes=new THREE.Group();neck.add(eyes);f.eyes=eyes;for(const sign of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.065,6,4),new THREE.MeshBasicMaterial({color:'#ffe4e9',fog:false}));eye.position.set(sign*.21,1.04,.26);eyes.add(eye);const halo=this.halo('#ff2e57',.5,.9);halo.position.copy(eye.position);eyes.add(halo);}
      f.legs=[-1,1].map(sign=>{const leg=new THREE.Group();leg.position.set(sign*.28,-.28,.1);hips.add(leg);const foot=this.mesh(new THREE.ConeGeometry(.21,.3,3),'#ff9a37',0,-.32,.12);foot.rotation.x=Math.PI/2;leg.add(foot);return leg;});
      root.scale.setScalar(1.25);
    }
    const coneGeo=new THREE.CylinderGeometry(.02,Math.tan(TUNE.halfCone)*7,7,20,5,true);coneGeo.translate(0,-3.5,0);coneGeo.rotateX(-Math.PI/2);
    const coneMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{color:{value:new THREE.Color('#ffe2a8')}},vertexShader:'varying float along;void main(){along=position.z/7.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 color;varying float along;void main(){float a=0.075*pow(clamp(1.0-along,0.0,1.0),1.5);gl_FragColor=vec4(color,a);}'});
    f.beam.add(new THREE.Mesh(coneGeo,coneMat));this.scene.add(f.beam,root);this.figures.set(e.id,f);return f;
  }
  render(now:number,snapshot:ChaseSnapshot|undefined,id:string,local:Point,position:(e:Entity)=>Point,torchColor:string){const dt=Math.min(.1,(now-this.previous)/1000||.016);this.previous=now;if(!this.initialized){this.renderer.render(this.scene,this.camera);return;}
    let entities=snapshot?.entities;if(!entities){if(!this.titleEntities.length){for(let i=0;i<3;i++)this.titleEntities.push({id:`title-${i}`,role:i===2?'goose':'kid',personality:i,name:'',x:0,z:0,facing:0,aim:0,battery:100,light:i<2,held:i<2,bot:true,vx:2,vz:0,frozenUntil:0,immuneUntil:0,safeUntil:0,score:0,lungeAt:-10,lungeAngle:0,lungeHit:false,lastLight:0,dwell:{},touch:{}});}entities=this.titleEntities;for(let i=0;i<3;i++){const e=entities[i],t=now*.00025+i*1.5;e.x=Math.sin(t)*5;e.z=5.5+Math.cos(t)*1.15;e.facing=Math.atan2(Math.cos(t)*5,-Math.sin(t)*1.15);e.aim=e.facing+.4*Math.sin(now*.0007);}}
    this.drawPositions.clear();for(const e of entities)this.drawPositions.set(e.id,snapshot?e.id===id?local:position(e):e);
    this.beams.update(entities,this.drawPositions,torchColor);
    for(const [key,f] of this.figures)if(!entities.some(e=>e.id===key&&e.role===f.role)){this.scene.remove(f.root,f.beam);f.mixer?.stopAllAction();f.mixer?.uncacheRoot(f.body);f.root.traverse(n=>{if(n instanceof THREE.Mesh){if(!n.userData.sharedGeometry)n.geometry.dispose();if(Array.isArray(n.material))n.material.forEach(m=>m.dispose());else n.material.dispose();}});f.beam.traverse(n=>{if(n instanceof THREE.Mesh){n.geometry.dispose();n.material.dispose();}});this.figures.delete(key);}
    for(const e of entities){const f=this.figures.get(e.id)??this.figure(e,e.id===id),p=this.drawPositions.get(e.id)!,moved=distance(p,f.last),speed=Math.min(9,moved/Math.max(dt,.001)),moving=speed>.1,time=snapshot?.now??now/1000,frozen=e.frozenUntil>time,t=time-e.lungeAt;
      f.phase+=moved*8;f.still=moving?0:f.still+dt;f.root.position.set(p.x,0,p.z);f.root.rotation.y=e.facing;f.last.x=p.x;f.last.z=p.z;f.marker.visible=e.id===id;f.shadow.scale.setScalar(moving?.95:1);
      if(f.mixer){f.run!.setEffectiveWeight(moving?1:0);f.run!.setEffectiveTimeScale(Math.max(.5,speed/3.3));f.idle!.setEffectiveWeight(moving?0:1);if(!frozen)f.mixer.update(dt);f.body.position.y=moving?Math.abs(Math.sin(f.phase))*.08:Math.sin(now*.003)*.025;}
      if(f.hips){const dash=t>=0&&t<.84;f.hips.rotation.z=frozen?0:Math.sin(f.phase)*.14*(moving?1:.1);f.hips.rotation.x=dash?.25:0;f.hips.position.y=.7+(frozen?0:Math.abs(Math.sin(f.phase))*.06);f.neck!.rotation.x=dash?(t<.12?-.45:t<.34?1.05:.4):-Math.sin(f.phase*2)*.07;f.wings!.forEach((w,i)=>w.rotation.z=(i?1:-1)*(dash?.8:Math.sin(f.phase)*.15));f.legs!.forEach((l,i)=>l.rotation.x=frozen?0:Math.sin(f.phase+(i?Math.PI:0))*.5);f.eyes!.visible=f.still<.6||dash||e.id===id||frozen;f.eyes!.scale.y=frozen?.5:1;}
      f.beam.visible=e.role==='kid'&&e.light;f.beam.position.set(p.x,1.3,p.z);f.beam.rotation.set(-.14,e.aim,0,'YXZ');
    }
    this.pickups.forEach((root,i)=>{const p=snapshot?.pickups[i];root.visible=!!p&&p.readyAt<=snapshot!.now;if(p){root.position.set(p.x,.12+Math.sin(now*.003+i)*.1,p.z);root.rotation.y=now*.0015;}});
    const active=!snapshot||!!snapshot.lamps?.[0]?.active;this.lampHalo.material.opacity=active?.65:.12;this.lampPool.visible=active;this.plants.forEach((p,i)=>{(p as THREE.Sprite).material.opacity=.4+Math.sin(now*.002+i)*.1;});
    const me=entities.find(e=>e.id===id),goal=me?local:{x:0,z:4};const look=me?new THREE.Vector3(me.vx*.25,0,me.vz*.25):new THREE.Vector3();look.clampLength(0,2);this.ahead.lerp(look,1-Math.exp(-dt*2.5));const gx=THREE.MathUtils.clamp(goal.x+this.ahead.x,-9,9),gz=THREE.MathUtils.clamp(goal.z-1.5+this.ahead.z,-6,6);if(!this.focus.lengthSq())this.focus.set(gx,0,gz);this.focus.lerp(tmp.set(gx,0,gz),1-Math.exp(-dt*8));
    const d=snapshot?(innerHeight<600?16:18):21.5,angle=47*Math.PI/180;this.camera.position.set(this.focus.x,Math.sin(angle)*d,this.focus.z+Math.cos(angle)*d);this.camera.lookAt(this.focus);(this.roof.material as THREE.Material).opacity=me&&Math.abs(local.x)<4&&local.z<2?.32:1;
    if(!document.hidden)this.renderer.render(this.scene,this.camera);
  }
}
