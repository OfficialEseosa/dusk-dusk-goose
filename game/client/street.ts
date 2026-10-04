import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { RoomSnapshot } from "../shared/protocol";
import { MOVE_SPEED, moveOnStreet, HOUSE_X, HOUSE_MODELS, HOUSE_Z, LAMP_X, SOLIDS, FLASHLIGHT_PROFILE as BEAM } from "../shared/street-layout";

import { PREP_BOUNDS, HIDING_SPOTS } from "../shared/round";

type Pose = { x: number; z: number; facing: number; seq: number };
type Player = RoomSnapshot["players"][number];
type AnimatedPart = { node: THREE.Mesh; geometry: THREE.BufferGeometry; offset: number };
type CharacterBatch = {
  mesh: THREE.Mesh; parts: AnimatedPart[];
  positions: THREE.BufferAttribute; normals: THREE.BufferAttribute;
};
type Figure = {
  group: THREE.Group; model: THREE.Object3D; mixer: THREE.AnimationMixer;
  batch: CharacterBatch;
  idle?: THREE.AnimationAction; walk?: THREE.AnimationAction; moving: boolean;
  light: THREE.SpotLight; target: THREE.Object3D;
  previous: Pose; next: Pose; received: number; label: HTMLSpanElement;
};

/** Owns the persistent canvas and movement controls for the single street. */
export class Street {
  private readonly scene = new THREE.Scene();
  private readonly prep = new THREE.Scene();
  private place = "street";
  private roundNumber = 0;
  private capsule?: THREE.Mesh;
  private capsuleLabel?:HTMLSpanElement;
  private prepAmbient?:THREE.HemisphereLight;
  private prepLamp?:THREE.PointLight;
  private readonly camera = new THREE.OrthographicCamera();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly loader = new GLTFLoader();
  private readonly assets = new Map<string, GLTF>();
  private readonly figures = new Map<string, Figure>();
  private readonly keys = new Set<string>();
  private readonly lamps: THREE.PointLight[] = [];
  private readonly bulbs: THREE.MeshStandardMaterial[] = [];
  private readonly ambient = new THREE.HemisphereLight(0x718bd2, 0x192334, 0.7);
  private readonly moon = new THREE.DirectionalLight(0x95b6ff, 0.8);
  private readonly stick: HTMLButtonElement;
  private readonly knob: HTMLSpanElement;
  private readonly resize: ResizeObserver;
  private localId = "";
  private pose: Pose = { x: 0, z: 2, facing: Math.PI, seq: 0 };
  private connected = true;
  private disposed = false;
  private ready = false;
  private snapshot?: RoomSnapshot;
  private serverOffset = 0;
  private blackout = false;
  private frame = 0;
  private lastFrame = 0;
  private lastSend = 0;
  private lastMetrics = 0;
  private lastObservation = 0;
  private frames: number[] = [];
  private allFrames: number[] = [];
  private axis = new THREE.Vector2();
  private pointer: number | null = null;
  private origin = new THREE.Vector2();
  private direction = new THREE.Vector3();
  private projected = new THREE.Vector3();
  private cameraFocus = new THREE.Vector3();
  private cameraHalfHeight = 5;
  private readonly cameraOffset = new THREE.Vector3(9,22,23);
  private readonly cameraRight = new THREE.Vector3(23,0,-9).normalize();
  private readonly cameraUp = new THREE.Vector3().crossVectors(this.cameraOffset.clone().normalize(),this.cameraRight);
  private readonly framingPoints = Array.from({length:66},()=>new THREE.Vector3());
  private movePath:{x:number;z:number}[]=[];
  private readonly characterInverse = new THREE.Matrix4();
  private readonly characterTransform = new THREE.Matrix4();
  private readonly characterNormal = new THREE.Matrix3();
  private readonly characterVertex = new THREE.Vector3();

  constructor(private readonly container: HTMLElement, private readonly onPose: (pose: Pose & {path?:{x:number;z:number}[]}) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = "street-canvas";
    this.renderer.domElement.dataset.flashlight=JSON.stringify(BEAM);
    this.renderer.domElement.setAttribute("aria-label", "Maple Street at night");
    this.container.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x071024);
    this.scene.fog = new THREE.Fog(0x071024, 42, 85);
    this.scene.add(this.ambient, this.moon);
    this.moon.position.set(-15, 26, -12);
    this.stick = document.createElement("button");
    this.stick.id = "move-stick";
    this.stick.className = "move-stick";
    this.stick.type = "button";
    this.stick.setAttribute("aria-label", "Move. Drag to walk");
    this.knob = document.createElement("span");
    this.knob.className = "knob";
    this.stick.append(this.knob);
    this.container.append(this.stick);
    this.stick.addEventListener("pointerdown", this.pointerDown);
    this.stick.addEventListener("pointermove", this.pointerMove);
    this.stick.addEventListener("pointerup", this.pointerEnd);
    this.stick.addEventListener("pointercancel", this.pointerEnd);
    this.stick.addEventListener("lostpointercapture", this.pointerEnd);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.clearInput);
    document.addEventListener("visibilitychange", this.visibility);
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(this.container);
    this.resizeCanvas();
  }

  async initialize(localId: string, snapshot: RoomSnapshot) {
    this.localId = localId;
    this.update(snapshot);
    const paths = [
      ...["a", "b", "c", "d", "e", "f"].map(letter => `city-kit-suburban/building-type-${letter}.glb`),
      ...["tree-small", "tree-large", "fence-low", "planter", "driveway-short"].map(name => `city-kit-suburban/${name}.glb`),
      "city-kit-roads/light-curved.glb", "city-kit-roads/electricity-pole.glb",
      ...["bedSingle","cabinetBedDrawerTable","books","rugRectangle","cardboardBoxClosed"].map(name=>`furniture-kit/${name}.glb`),
      "car-kit/sedan.glb", "car-kit/van.glb", "furniture-kit/trashcan.glb",
      ...["a", "b", "c", "d", "e", "f"].map(letter => `blocky-characters/character-${letter}.glb`),
    ];
    await Promise.all(paths.map(async path => {
      const asset = await this.loader.loadAsync(`/assets/kenney/${path}`);
      if (this.disposed) { this.releaseObject(asset.scene); return; }
      this.assets.set(path, asset);
    }));
    if (this.disposed) return;
    this.buildStreet();
    this.mergeStaticGeometry();
    this.buildPreparation();
    this.ready = true;
    this.renderer.domElement.dataset.ready = "true";
    const current = this.snapshot ?? snapshot;
    const offset = this.serverOffset;
    this.update(current);
    this.serverOffset = offset;
    const local = current.players.find(player => player.id === localId);
    if (local) this.pose = this.fromPlayer(local);
    this.cameraFocus.set(this.pose.x, 0, this.pose.z);
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.animate);
  }

  update(snapshot: RoomSnapshot) {
    this.snapshot = snapshot;
    this.serverOffset = snapshot.serverTime - Date.now();
    if (!this.ready) return;
    const local=snapshot.players.find(p=>p.id===this.localId);
    const nextPlace=local?.place??"street", nextRound=snapshot.round?.number??0;
    if(local&&(this.place!==nextPlace||this.roundNumber!==nextRound)){
      this.restorePose(this.fromPlayer(local));this.clearInput();
      this.place=nextPlace;this.roundNumber=nextRound;
    }
    this.renderer.domElement.dataset.location=this.place;
    this.renderer.domElement.dataset.roundPhase=snapshot.round?.phase??"";
    this.renderer.domElement.dataset.role=local?.role??"";
    const present = new Set(snapshot.players.map(player => player.id));
    for (const [id, figure] of this.figures) {
      if (!present.has(id)) {
        figure.group.removeFromParent();figure.light.removeFromParent();figure.target.removeFromParent();
        figure.mixer.stopAllAction(); figure.mixer.uncacheRoot(figure.model);
        for (const child of figure.group.children) if (child !== figure.model && child !== figure.batch.mesh) this.releaseObject(child);
        figure.batch.mesh.geometry.dispose();
        for (const part of figure.batch.parts) part.geometry.dispose();
        figure.light.shadow.dispose();
        figure.label.remove(); this.figures.delete(id);
      }
    }
    for (const player of snapshot.players) {
      let figure = this.figures.get(player.id);
      if (!figure) { figure = this.createFigure(player); this.figures.set(player.id, figure); }
      const world=this.place==="prep"?this.prep:this.scene;
      if(figure.group.parent!==world)world.add(figure.group,figure.light,figure.target);
      figure.light.visible=player.flashlight??true;
      figure.group.children.filter(c=>c.userData.flashlight).forEach(c=>c.visible=player.flashlight??true);
      figure.label.textContent = player.id === this.localId ? "You" : player.name;
      figure.label.dataset.connected = String(player.connected);
      if (player.id !== this.localId && player.seq !== figure.next.seq) {
        figure.previous = {
          x: figure.group.position.x, z: figure.group.position.z,
          facing: figure.group.rotation.y, seq: figure.next.seq,
        };
        figure.next = this.fromPlayer(player); figure.received = performance.now();
      }
    }
    // The same two seats cast shadows on every device, independent of who is local.
    const shadowSeats = snapshot.players.filter(p=>p.flashlight!==false).sort((a,b)=>a.skin-b.skin).slice(0,BEAM.maxShadowLights).map(p=>p.id);
    for (const [id,figure] of this.figures) figure.light.castShadow=shadowSeats.includes(id);
  }

  get localPose() { return {...this.pose}; }
  get loaded() { return this.ready; }

  setConnection(connected: boolean) { this.connected = connected; if (!connected) this.clearInput(); }

  /** Used only when resuming a credential or when a server rejects an invalid move. */
  restorePose(pose: Pose) {
    this.pose = { x: pose.x, z: pose.z, facing: pose.facing, seq: pose.seq };
    this.movePath=[];
    this.lastSend = 0;
  }

  get isDark() { return this.blackout; }

  private fromPlayer(player: Player): Pose { return { x: player.x, z: player.z, facing: player.facing, seq: player.seq }; }

  private model(path: string, width: number, x: number, z: number, rotation = 0) {
    const object = this.assets.get(path)!.scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const scale = width / Math.max(size.x, 0.01);
    object.scale.setScalar(scale);
    object.position.set(x - centre.x * scale, -bounds.min.y * scale, z - centre.z * scale);
    const wrapper = new THREE.Group(); wrapper.add(object); wrapper.rotation.y = rotation;
    // Rotation happens around the authored placement, rather than the street origin.
    object.position.x -= x; object.position.z -= z; wrapper.position.set(x, 0, z);
    wrapper.traverse(node => { if (node instanceof THREE.Mesh) {
      if(path.includes("driveway")) {
        node.material=Array.isArray(node.material)?node.material.map(m=>m.clone()):node.material.clone();
        for(const material of Array.isArray(node.material)?node.material:[node.material]) this.groundMaterial(material as THREE.MeshStandardMaterial);
      }
      node.receiveShadow = true; node.castShadow = true; for(const material of Array.isArray(node.material)?node.material:[node.material]) material.userData.kit=path.split('/')[0]; } });
    this.scene.add(wrapper); return wrapper;
  }

  private box(width: number, height: number, depth: number, color: number, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    if (height <= 0.35 && width > 1) this.groundMaterial(mesh.material);
    mesh.position.set(x, y, z); mesh.receiveShadow = true; this.scene.add(mesh); return mesh;
  }

  /** Lift grazing spotlight response on horizontal ground, retaining the real
   * cone, soft edge and shadow mask. Walls keep their ordinary diffuse response. */
  private groundMaterial(material: THREE.MeshStandardMaterial) {
    material.userData.ground = true;
    material.customProgramCacheKey = () => "ground-spot-response-v1";
    material.onBeforeCompile = shader => {
      const chunk = THREE.ShaderChunk.lights_fragment_begin.replace(
        "getSpotLightInfo( spotLight, geometryPosition, directLight );",
        `getSpotLightInfo( spotLight, geometryPosition, directLight );
        directLight.color *= 1.7 * clamp(1.0 / max(dot(geometryNormal, directLight.direction), 0.12), 1.0, 8.0);`
      );
      shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_begin>", chunk);
    };
  }

  private buildStreet() {
    this.box(108, 0.35, 66, 0x304434, 0, -0.35, -8);
    this.box(90, 0.09, 12, 0x424957, 0, -0.1, 2.5);
    this.box(90, 0.12, 3.1, 0x9397a1, 0, -0.04, -5.1);
    this.box(90, 0.14, 0.23, 0xb4bcc8, 0, 0.015, -3.5);
    this.box(90, 0.1, 0.24, 0x8a949f, 0, 0, 8.2);
    for (let x = -43; x < 45; x += 6) this.box(2.2, 0.01, 0.1, 0xb6b2a0, x, -0.035, 2.7);
    for (let index = 0; index < HOUSE_X.length; index++) {
      const x = HOUSE_X[index];
      this.box(11.4, 0.03, 13, index % 2 ? 0x405340 : 0x465848, x, -0.04, -12.9);
      this.model(`city-kit-suburban/building-type-${HOUSE_MODELS[index]}.glb`, 8.5, x, HOUSE_Z);
      this.box(1.2, 0.05, 5.5, 0x8f969c, x + 1.9, 0.02, -8.2);
      const front=SOLIDS.find(s=>s.id===`house-${index}`)!.maxZ;
      const porchDepth=Math.max(.6,-9.8-front);
      this.box(1.6,.18,porchDepth,0x8f969c,x-3,.025,front+porchDepth/2);
      this.model("city-kit-suburban/driveway-short.glb", 3.6, x - 3.6, -8.1);
      this.model("city-kit-suburban/planter.glb", 1.2, x + 3.4, -8.7);
      this.model("furniture-kit/trashcan.glb", 0.48, x + 4.1, -6.8);
      this.model("city-kit-suburban/tree-small.glb", 2.6, x + 4.7, -12.4);
      this.box(0.12,1.05,0.12,0x566574,x-1.8,0.525,-7.4);
      this.box(0.45,0.32,0.4,0x647180,x-1.8,1.12,-7.4);
      for (let i = 0; i < 3; i++) this.model("city-kit-suburban/fence-low.glb", 2.4, x - 4 + i * 2.5, -20);
    }
    this.model("car-kit/sedan.glb", 2.5, -17, -0.8, Math.PI / 2);
    this.model("car-kit/van.glb", 2.4, 19, -0.8, Math.PI / 2);
    for (const x of LAMP_X) {
      // Centre the grounded pole at -3.9, rather than centring its overhead arm there.
      this.model("city-kit-roads/light-curved.glb", 0.30, x, -3.375, Math.PI);
      const lamp = new THREE.PointLight(0xffd995, 90, 15, 1.4);
      lamp.position.set(x, 4.0, -2.7); this.scene.add(lamp); this.lamps.push(lamp);
      const bulbMaterial = new THREE.MeshStandardMaterial({ color: 0xffe7a9, emissive: 0xffc66b, emissiveIntensity: 2 });
      this.bulbs.push(bulbMaterial);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), bulbMaterial);
      bulb.position.copy(lamp.position); this.scene.add(bulb);
    }
    this.model("city-kit-roads/electricity-pole.glb", 1.5, -37, -5.4);
    this.model("city-kit-roads/electricity-pole.glb", 1.5, 37, -5.4);
    // Repeated kit trees form a dark, irregular vignette without alpha foliage or post-processing.
    for (let index = 0; index < 31; index++) {
      const x = -46 + index * 3;
      this.model("city-kit-suburban/tree-large.glb", 4.5 + (index % 3) * 0.6, x, -24 - (index % 2) * 2);
    }
    for (let index = 0; index < 12; index++) {
      this.model("city-kit-suburban/tree-large.glb", 2.5 + (index % 3) * 0.25, -42 + index * 7.6, 17 + (index % 2) * 2);
    }
    for (const x of [-43, 43]) for (const z of [-15, -8, 0, 7]) this.model("city-kit-suburban/tree-large.glb", 5.5, x, z);
  }

  private buildPreparation() {
    this.prep.background=new THREE.Color(0x0d192b);
    this.prepAmbient=new THREE.HemisphereLight(0x718bd2,0x192334,.65);this.prep.add(this.prepAmbient);
    const moon=new THREE.DirectionalLight(0x95b6ff,.8);moon.position.set(-15,26,-12);this.prep.add(moon);
    this.prepLamp=new THREE.PointLight(0xffd09a,20,15,1);this.prepLamp.position.set(0,4,-1);this.prep.add(this.prepLamp);
    const box=(w:number,h:number,d:number,color:number,x:number,y:number,z:number)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:1}));if(h<=.25&&w>1)this.groundMaterial(mesh.material);mesh.position.set(x,y,z);this.prep.add(mesh);return mesh;
    };
    box(11,.2,8,0x665342,0,-.1,0);box(11,3,.2,0x60717c,0,1.5,-3.8);box(.2,3,8,0x60717c,-5.4,1.5,0);
    const furniture=(name:string,width:number,x:number,z:number)=>{
      const asset=this.assets.get(`furniture-kit/${name}.glb`)!.scene.clone(true);
      const bounds=new THREE.Box3().setFromObject(asset),scale=width/bounds.getSize(new THREE.Vector3()).x;
      const centre=bounds.getCenter(new THREE.Vector3());asset.scale.setScalar(scale);asset.position.set(x-centre.x*scale,-bounds.min.y*scale,z-centre.z*scale);this.prep.add(asset);return asset;
    };
    furniture("bedSingle",2,-3.7,-2.1);const table=furniture("cabinetBedDrawerTable",1.8,0,-2.8);
    const tableTop=new THREE.Box3().setFromObject(table).max.y;
    furniture("cardboardBoxClosed",.9,4,-2.7);furniture("rugRectangle",3.5,0,1);
    const books=furniture("books",.7,3,-2.9);books.position.y+=.05;
    for(let i=0;i<6;i++) {
      const torch=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,.38,6),new THREE.MeshStandardMaterial({color:0xc3974b}));
      torch.rotation.z=Math.PI/2;torch.position.set(-.65+i*.26,tableTop+.085,-2.65);this.prep.add(torch);
    }
    this.capsule=new THREE.Mesh(new THREE.BoxGeometry(.48,.32,.28),new THREE.MeshBasicMaterial({color:0xffd181}));this.capsule.visible=false;this.scene.add(this.capsule);
    this.capsuleLabel=document.createElement("span");this.capsuleLabel.className="capsule-label";this.capsuleLabel.textContent="Capsule";this.capsuleLabel.hidden=true;this.container.append(this.capsuleLabel);
  }

  /** Merge static meshes by palette/material rather than issuing one draw per kit object. */
  private mergeStaticGeometry(){
    this.scene.updateMatrixWorld(true);
    const buckets=new Map<string,{material:THREE.Material;geometries:THREE.BufferGeometry[];meshes:THREE.Mesh[]}>();
    this.scene.traverse(node=>{
      if(!(node instanceof THREE.Mesh)||Array.isArray(node.material))return;
      const material=node.material as THREE.MeshStandardMaterial;
      const key=JSON.stringify([material.type,material.userData.kit??'plain',material.userData.ground??false,material.color?.getHex(),material.roughness,material.metalness,material.map?.name??'',material.emissive?.getHex()]);
      let bucket=buckets.get(key);if(!bucket){bucket={material,geometries:[],meshes:[]};buckets.set(key,bucket);}
      const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();
      geometry.applyMatrix4(node.matrixWorld);
      for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);
      if(!geometry.attributes.normal)geometry.computeVertexNormals();
      if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
      bucket.geometries.push(geometry);bucket.meshes.push(node);
    });
    for(const bucket of buckets.values()){
      const geometry=mergeGeometries(bucket.geometries,false);
      if(geometry){const mesh=new THREE.Mesh(geometry,bucket.material);mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);for(const old of bucket.meshes)old.removeFromParent();}
      for(const part of bucket.geometries)part.dispose();
    }
  }

  private createFigure(player: Player): Figure {
    const asset = this.assets.get(`blocky-characters/character-${String.fromCharCode(97 + player.skin)}.glb`)!;
    const model = clone(asset.scene);
    const bounds = new THREE.Box3().setFromObject(model);
    const height = bounds.max.y - bounds.min.y;
    model.scale.setScalar(1.65 / height);
    model.position.y = -bounds.min.y * model.scale.y;
    model.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; } });
    const group = new THREE.Group(); group.add(model);
    group.position.set(player.x, 0, player.z); group.rotation.y = player.facing;
    const batch = this.batchCharacter(model, group);
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0x303742, roughness: 0.65 }));
    torch.userData.flashlight=true;
    torch.rotation.x = Math.PI / 2; torch.position.set(-0.38, 0.95, 0.35); group.add(torch);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), new THREE.MeshBasicMaterial({ color: 0xffdd99 }));
    glass.userData.flashlight=true;
    glass.position.set(-0.38, 0.95, 0.49); group.add(glass);
    const target = new THREE.Object3D();
    const light = new THREE.SpotLight(BEAM.color, BEAM.intensity, BEAM.range, BEAM.halfAngle, BEAM.penumbra, 0);
    light.target = target;
    light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.001; light.shadow.normalBias = 0.04;
    const mixer = new THREE.AnimationMixer(model);
    const idleClip = asset.animations.find(clip => clip.name === "idle");
    const walkClip = asset.animations.find(clip => clip.name === "walk");
    const idle = idleClip ? mixer.clipAction(idleClip) : undefined;
    const walk = walkClip ? mixer.clipAction(walkClip) : undefined;
    idle?.play();
    const label = document.createElement("span"); label.className = "player-label";
    label.dataset.player = player.id; this.container.append(label);
    this.scene.add(group, light, target);
    const pose = this.fromPlayer(player);
    return { group, model, batch, mixer, idle, walk, moving: false, light, target, previous: pose, next: pose, received: performance.now(), label };
  }

  /** Kenney's animated rigid limbs share one palette and can draw as one mesh. */
  private batchCharacter(model: THREE.Object3D, group: THREE.Group): CharacterBatch {
    const parts: AnimatedPart[] = [];
    let count = 0;
    let material: THREE.Material | undefined;
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      parts.push({ node, geometry, offset: count });
      count += geometry.attributes.position.count;
      material ??= Array.isArray(node.material) ? node.material[0] : node.material;
      // Animation still targets the original hierarchy; only its renderer is hidden.
      node.visible = false;
    });
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const normals = new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const uv = new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2);
    for (const part of parts) {
      const source = part.geometry.attributes.uv;
      if (!source) continue;
      for (let vertex = 0; vertex < source.count; vertex++) uv.setXY(part.offset + vertex, source.getX(vertex), source.getY(vertex));
    }
    geometry.setAttribute("position", positions);
    geometry.setAttribute("normal", normals);
    geometry.setAttribute("uv", uv);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    const batch = { mesh, parts, positions, normals };
    this.updateCharacterBatch(group, batch);
    return batch;
  }

  private updateCharacterBatch(group: THREE.Group, batch: CharacterBatch) {
    group.updateMatrixWorld(true);
    this.characterInverse.copy(group.matrixWorld).invert();
    for (const part of batch.parts) {
      this.characterTransform.multiplyMatrices(this.characterInverse, part.node.matrixWorld);
      this.characterNormal.getNormalMatrix(this.characterTransform);
      const positions = part.geometry.attributes.position, normals = part.geometry.attributes.normal;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        this.characterVertex.fromBufferAttribute(positions, vertex).applyMatrix4(this.characterTransform);
        batch.positions.setXYZ(part.offset + vertex, this.characterVertex.x, this.characterVertex.y, this.characterVertex.z);
        this.characterVertex.fromBufferAttribute(normals, vertex).applyNormalMatrix(this.characterNormal);
        batch.normals.setXYZ(part.offset + vertex, this.characterVertex.x, this.characterVertex.y, this.characterVertex.z);
      }
    }
    batch.positions.needsUpdate = true; batch.normals.needsUpdate = true;
    batch.mesh.geometry.computeBoundingSphere();
  }

  private setMoving(figure: Figure, moving: boolean) {
    if (figure.moving === moving) return;
    figure.moving = moving;
    const next = moving ? figure.walk : figure.idle;
    const old = moving ? figure.idle : figure.walk;
    next?.reset().fadeIn(0.12).play(); old?.fadeOut(0.12);
  }

  private animate = () => {
    if (this.disposed) return;
    // Use the same clock as snapshot receipt. rAF timestamps can predate a
    // WebSocket callback when a busy renderer delays this callback.
    const now = performance.now();
    const elapsed = now - this.lastFrame;
    const dt = Math.min(elapsed / 1000, 0.05); this.lastFrame = now;
    if (!document.hidden) { this.frames.push(elapsed); this.allFrames.push(elapsed); }
    if (this.allFrames.length > 36000) this.allFrames.splice(0, 18000);
    this.blackout = Boolean(this.snapshot?.blackoutAt && Date.now() + this.serverOffset >= this.snapshot.blackoutAt);
    this.ambient.intensity = this.blackout ? 0.32 : 0.7;
    this.moon.intensity = this.blackout ? 0.65 : 0.8;
    if(this.prepAmbient)this.prepAmbient.intensity=this.blackout?.35:.65;
    if(this.prepLamp)this.prepLamp.intensity=this.blackout?0:20;
    for (const lamp of this.lamps) lamp.intensity = this.blackout ? 0 : 90;
    for (const bulb of this.bulbs) bulb.emissiveIntensity = this.blackout ? 0 : 2;
    this.renderer.domElement.dataset.light = this.blackout ? "dark" : "lit";
    this.renderer.domElement.dataset.lit = String(!this.blackout);
    let dx = this.axis.x, dz = this.axis.y;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) dz -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dz += 1;
    const length = Math.hypot(dx, dz);
    const revealViewing=this.snapshot?.round?.phase==="reveal"&&Date.now()+this.serverOffset<(this.snapshot.round.revealReadyAt??0);
    const moving = length > 0.08 && this.connected && !document.hidden&&!revealViewing;
    if (moving) {
      dx /= Math.max(length, 1); dz /= Math.max(length, 1);
      const target={x:this.pose.x+dx*MOVE_SPEED*dt,z:this.pose.z+dz*MOVE_SPEED*dt};
      const next=this.place==="prep"?{x:THREE.MathUtils.clamp(target.x,PREP_BOUNDS.minX,PREP_BOUNDS.maxX),z:THREE.MathUtils.clamp(target.z,PREP_BOUNDS.minZ,PREP_BOUNDS.maxZ)}:
        moveOnStreet(this.pose,target,point=>this.movePath.push(point));
      this.pose.x=next.x;this.pose.z=next.z;
      this.pose.facing = Math.atan2(dx, dz);
    }
    if (this.connected && !document.hidden && now - this.lastSend >= 50) {
      this.lastSend = now; this.pose.seq++; this.onPose({ ...this.pose,path:this.movePath.length?this.movePath:[{x:this.pose.x,z:this.pose.z}] });this.movePath=[];
    }
    const labelWidth = this.container.clientWidth, labelHeight = this.container.clientHeight;
    const revealed=this.snapshot?.round?.phase==="reveal"?this.snapshot.round.capsuleSpotId:undefined;
    const revealedSpot=HIDING_SPOTS.find(s=>s.id===revealed);
    if(revealViewing&&revealedSpot) {
      this.cameraFocus.lerp(this.projected.set(revealedSpot.x,0,revealedSpot.z),1-Math.exp(-5*dt));
      const halfHeight=labelHeight<=500?4.7:9.5,aspect=labelWidth/labelHeight;
      this.camera.left=-halfHeight*aspect;this.camera.right=halfHeight*aspect;this.camera.top=halfHeight;this.camera.bottom=-halfHeight;
      this.camera.position.copy(this.cameraFocus).add(this.cameraOffset);this.camera.lookAt(this.cameraFocus);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
    }else if(this.place==="prep") {
      const halfHeight=4.7,aspect=labelWidth/labelHeight;
      this.camera.left=-halfHeight*aspect;this.camera.right=halfHeight*aspect;this.camera.top=halfHeight;this.camera.bottom=-halfHeight;
      this.camera.position.set(6,11,10);this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
    }else this.frameBeam(dt, labelWidth, labelHeight);
    if(this.capsule) {
      this.capsule.visible=Boolean(revealedSpot);
      if(revealedSpot)this.capsule.position.set(revealedSpot.x,.22,revealedSpot.z);
    }
    if(this.capsuleLabel) {
      this.capsuleLabel.hidden=!revealedSpot||this.place==="prep"&&!revealViewing;
      if(revealedSpot) {
        this.projected.set(revealedSpot.x,.8,revealedSpot.z).project(this.camera);
        this.capsuleLabel.hidden ||= Math.abs(this.projected.x)>1||Math.abs(this.projected.y)>1;
        this.capsuleLabel.style.transform=`translate(${(this.projected.x*.5+.5)*labelWidth}px,${(-this.projected.y*.5+.5)*labelHeight}px)`;
      }
    }
    const observed: Record<string, Pose> = {};
    for (const [id, figure] of this.figures) {
      const local = id === this.localId;
      if (local) {
        figure.group.position.set(this.pose.x, 0, this.pose.z); figure.group.rotation.y = this.pose.facing;
        this.setMoving(figure, moving);
      } else {
        const t = THREE.MathUtils.clamp((now - figure.received) / 100, 0, 1);
        figure.group.position.x = THREE.MathUtils.lerp(figure.previous.x, figure.next.x, t);
        figure.group.position.z = THREE.MathUtils.lerp(figure.previous.z, figure.next.z, t);
        const delta = Math.atan2(Math.sin(figure.next.facing - figure.previous.facing), Math.cos(figure.next.facing - figure.previous.facing));
        figure.group.rotation.y = figure.previous.facing + delta * t;
        this.setMoving(figure, now - figure.received < 180 && Math.hypot(figure.previous.x - figure.next.x, figure.previous.z - figure.next.z) > 0.01);
      }
      figure.mixer.update(dt);
      this.updateCharacterBatch(figure.group, figure.batch);
      const facing = figure.group.rotation.y;
      this.direction.set(Math.sin(facing), 0, Math.cos(facing));
      figure.light.position.copy(figure.group.position).add(new THREE.Vector3(0, BEAM.height, 0)).addScaledVector(this.direction, BEAM.forwardOffset);
      figure.target.position.copy(figure.light.position).addScaledVector(this.direction, BEAM.targetDistance); figure.target.position.y = BEAM.targetY;
      this.projected.copy(figure.group.position).add(new THREE.Vector3(0, 2, 0)).project(this.camera);
      figure.label.dataset.screenX=String((this.projected.x*.5+.5)*labelWidth);
      figure.label.dataset.screenY=String((-this.projected.y*.5+.5)*labelHeight);
      figure.label.hidden = this.place==="prep"&&revealViewing || Math.abs(this.projected.x) > 1.05 || Math.abs(this.projected.y) > 1.05;
      observed[id] = { x: figure.group.position.x, z: figure.group.position.z, facing, seq: local ? this.pose.seq : figure.next.seq };
      if(local){
        const feet=figure.group.position.clone().project(this.camera),head=figure.group.position.clone().add(new THREE.Vector3(0,1.65,0)).project(this.camera);
        this.renderer.domElement.dataset.characterHeight=String(Math.abs(head.y-feet.y)*labelHeight/2);
      }
    }
    this.placeLabels(labelWidth,labelHeight);
    this.renderer.render(this.place==="prep"&&!revealViewing?this.prep:this.scene, this.camera);
    if (now - this.lastObservation >= 50) {
      const poses = JSON.stringify(observed);
      this.renderer.domElement.dataset.players = poses;
      this.renderer.domElement.dataset.playerposes = poses;
      this.renderer.domElement.dataset.poses = JSON.stringify(Object.entries(observed).map(([id, pose]) => ({ id, ...pose })));
      this.renderer.domElement.dataset.localId = this.localId;
      this.lastObservation = now;
    }
    if (now - this.lastMetrics > 500) {
      const average = this.frames.reduce((sum, value) => sum + value, 0) / Math.max(this.frames.length, 1);
      const sorted = [...this.allFrames].sort((a, b) => a - b);
      Object.assign(this.renderer.domElement.dataset, {
        fps: (1000 / average).toFixed(1), frameP95: String(sorted[Math.floor(sorted.length * 0.95)]?.toFixed(2) ?? 0),
        sampleFrames: String(this.allFrames.length), drawCalls: String(this.renderer.info.render.calls),
        triangles: String(this.renderer.info.render.triangles), localId: this.localId,
        shadowLights:String([...this.figures.values()].filter(f=>f.light.castShadow&&f.light.visible).length),
      });
      this.frames = []; this.lastMetrics = now;
    }
    this.frame = requestAnimationFrame(this.animate);
  };

  private placeLabels(width:number,height:number){
    const occupied:{x:number;y:number;w:number;h:number}[]=[];
    const hud=this.container.parentElement?.querySelector(".round-hud")?.getBoundingClientRect();
    if(hud)occupied.push({x:hud.x,y:hud.y,w:hud.width,h:hud.height});
    for(const figure of [...this.figures.values()].sort((a,b)=>Number(b.label.textContent==='You')-Number(a.label.textContent==='You'))){
      if(figure.label.hidden)continue;
      const w=Math.min(160,figure.label.offsetWidth),h=22;
      const anchorX=Number(figure.label.dataset.screenX),anchorY=Number(figure.label.dataset.screenY);
      let placed={x:anchorX-w/2,y:anchorY-h,w,h};
      find:for(let row=0;row<12;row++)for(const column of [0,-1,1]){
        const x=THREE.MathUtils.clamp(anchorX-w/2+column*(w+8),8,width-w-8),y=THREE.MathUtils.clamp(anchorY-h+(row%2?-1:1)*Math.ceil(row/2)*26,64,height-h-8);
        if(occupied.some(r=>x<r.x+r.w+6&&x+w+6>r.x&&y<r.y+r.h+4&&y+h+4>r.y))continue;
        placed={x,y,w,h};break find;
      }
      figure.label.style.transform=`translate(${Math.round(placed.x)}px,${Math.round(placed.y)}px)`;
      occupied.push(placed);
    }
  }

  /** Frame the real cone's ground intersection, rather than a screen-sized beam.
   * Include the lowest grass plane as well as raised paving in the envelope. */
  private frameBeam(dt:number,width:number,height:number) {
    const pitch = Math.atan2(BEAM.height-BEAM.targetY,BEAM.targetDistance);
    const forwardX=Math.sin(this.pose.facing),forwardZ=Math.cos(this.pose.facing);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let i=0;i<64;i++) {
      const theta=i*Math.PI*2/64;
      const side=Math.sin(BEAM.halfAngle)*Math.cos(theta);
      const down=-Math.sin(pitch)*Math.cos(BEAM.halfAngle)+Math.cos(pitch)*Math.sin(BEAM.halfAngle)*Math.sin(theta);
      const along=Math.cos(pitch)*Math.cos(BEAM.halfAngle)+Math.sin(pitch)*Math.sin(BEAM.halfAngle)*Math.sin(theta);
      const ground=-0.175, distance=(BEAM.height-ground)/-down;
      this.framingPoints[i].set(this.pose.x+forwardX*(BEAM.forwardOffset+along*distance)+forwardZ*side*distance,
        ground,this.pose.z+forwardZ*(BEAM.forwardOffset+along*distance)-forwardX*side*distance);
    }
    this.framingPoints[64].set(this.pose.x,0,this.pose.z);
    this.framingPoints[65].set(this.pose.x,1.65,this.pose.z);
    for(const point of this.framingPoints) {
      const x=point.dot(this.cameraRight),y=point.dot(this.cameraUp);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    const determinant=this.cameraRight.x*this.cameraUp.z-this.cameraRight.z*this.cameraUp.x;
    const targetX=(cx*this.cameraUp.z-this.cameraRight.z*cy)/determinant;
    const targetZ=(this.cameraRight.x*cy-cx*this.cameraUp.x)/determinant;
    this.cameraFocus.lerp(this.projected.set(targetX,0,targetZ),1-Math.exp(-6*dt));
    // While the focus eases after a turn, widen immediately enough to keep the
    // entire cone visible; close the view gently once its focus catches up.
    const focusX=this.cameraFocus.dot(this.cameraRight),focusY=this.cameraFocus.dot(this.cameraUp);
    const aspect=width/height;
    const required=Math.max((Math.max(maxX-focusX,focusX-minX)+0.6)/aspect,
      Math.max(maxY-focusY,focusY-minY)+0.6,height<=500?4.7:9.5);
    this.cameraHalfHeight=required>this.cameraHalfHeight?required:THREE.MathUtils.lerp(this.cameraHalfHeight,required,1-Math.exp(-6*dt));
    this.camera.left=-this.cameraHalfHeight*aspect;this.camera.right=this.cameraHalfHeight*aspect;
    this.camera.top=this.cameraHalfHeight;this.camera.bottom=-this.cameraHalfHeight;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.cameraFocus).add(this.cameraOffset);this.camera.lookAt(this.cameraFocus);this.camera.updateMatrixWorld();
    if (performance.now()-this.lastObservation>=50) this.renderer.domElement.dataset.beamBounds=JSON.stringify(this.framingPoints.slice(0,64).map(p=>{
      const projected=p.clone().project(this.camera);return{x:(projected.x*.5+.5)*width,y:(-projected.y*.5+.5)*height};
    }));
  }

  private resizeCanvas() {
    const width = Math.max(this.container.clientWidth, 1), height = Math.max(this.container.clientHeight, 1);
    const aspect = width / height;
    const halfHeight = height<=500?4.7:9.5;
    this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight;
    this.camera.near = 0.1; this.camera.far = 120; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private keyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault(); this.keys.add(key);
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.key.toLowerCase()); };
  private pointerDown = (event: PointerEvent) => {
    if (this.pointer !== null) return;
    event.preventDefault(); this.pointer = event.pointerId;
    const bounds = this.stick.getBoundingClientRect(); this.origin.set(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    this.stick.setPointerCapture(event.pointerId); this.pointerMove(event);
  };
  private pointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.pointer) return;
    event.preventDefault();
    this.axis.set((event.clientX - this.origin.x) / 42, (event.clientY - this.origin.y) / 42);
    if (this.axis.length() > 1) this.axis.normalize();
    this.knob.style.transform = `translate(${this.axis.x * 30}px,${this.axis.y * 30}px)`;
  };
  private pointerEnd = (event: PointerEvent) => { if (event.pointerId === this.pointer) this.clearInput(); };
  private clearInput = () => { this.keys.clear(); this.pointer = null; this.axis.set(0, 0); this.knob.style.transform = "translate(0,0)"; };
  private visibility = () => { if (document.hidden) this.clearInput(); this.lastFrame = performance.now(); };

  private releaseObject(object: THREE.Object3D) {
    object.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.resize.disconnect();
    window.removeEventListener("keydown", this.keyDown); window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.clearInput); document.removeEventListener("visibilitychange", this.visibility);
    this.stick.removeEventListener("pointerdown", this.pointerDown); this.stick.removeEventListener("pointermove", this.pointerMove);
    this.stick.removeEventListener("pointerup", this.pointerEnd); this.stick.removeEventListener("pointercancel", this.pointerEnd);
    this.stick.removeEventListener("lostpointercapture", this.pointerEnd);
    for (const figure of this.figures.values()) {
      figure.mixer.stopAllAction(); figure.light.shadow.dispose(); figure.label.remove();
      for (const part of figure.batch.parts) part.geometry.dispose();
    }
    this.releaseObject(this.scene); this.releaseObject(this.prep); for (const asset of this.assets.values()) this.releaseObject(asset.scene);
    this.capsuleLabel?.remove();this.renderer.dispose(); this.renderer.domElement.remove(); this.stick.remove();
  }
}
