import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { RoomSnapshot } from "../shared/protocol";
import { STREET_BOUNDS, MOVE_SPEED } from "../shared/street-layout";

type Pose = { x: number; z: number; facing: number; seq: number };
type Player = RoomSnapshot["players"][number];
type Figure = {
  group: THREE.Group; model: THREE.Object3D; mixer: THREE.AnimationMixer;
  idle?: THREE.AnimationAction; walk?: THREE.AnimationAction; moving: boolean;
  light: THREE.SpotLight; target: THREE.Object3D; cone: THREE.Mesh;
  previous: Pose; next: Pose; received: number; label: HTMLSpanElement;
};

/** Owns the persistent canvas and movement controls for the single street. */
export class Street {
  private readonly scene = new THREE.Scene();
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

  constructor(private readonly container: HTMLElement, private readonly onPose: (pose: Pose) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = "street-canvas";
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
    this.ready = true;
    this.renderer.domElement.dataset.ready = "true";
    const current = this.snapshot ?? snapshot;
    const offset = this.serverOffset;
    this.update(current);
    this.serverOffset = offset;
    const local = current.players.find(player => player.id === localId);
    if (local) this.pose = this.fromPlayer(local);
    this.cameraFocus.set(this.pose.x, 0, this.pose.z - 6);
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.animate);
  }

  update(snapshot: RoomSnapshot) {
    this.snapshot = snapshot;
    this.serverOffset = snapshot.serverTime - Date.now();
    if (!this.ready) return;
    const present = new Set(snapshot.players.map(player => player.id));
    for (const [id, figure] of this.figures) {
      if (!present.has(id)) {
        this.scene.remove(figure.group, figure.light, figure.target, figure.cone);
        figure.mixer.stopAllAction(); figure.mixer.uncacheRoot(figure.model);
        for (const child of figure.group.children) if (child !== figure.model) this.releaseObject(child);
        this.releaseObject(figure.cone); figure.light.shadow.dispose();
        figure.label.remove(); this.figures.delete(id);
      }
    }
    for (const player of snapshot.players) {
      let figure = this.figures.get(player.id);
      if (!figure) { figure = this.createFigure(player); this.figures.set(player.id, figure); }
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
  }

  setConnection(connected: boolean) { this.connected = connected; if (!connected) this.clearInput(); }

  /** Used only when resuming a credential or when a server rejects an invalid move. */
  restorePose(pose: Pose) {
    this.pose = { x: pose.x, z: pose.z, facing: pose.facing, seq: pose.seq };
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
    wrapper.traverse(node => { if (node instanceof THREE.Mesh) { node.receiveShadow = true; node.castShadow = true; } });
    this.scene.add(wrapper); return wrapper;
  }

  private box(width: number, height: number, depth: number, color: number, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    mesh.position.set(x, y, z); mesh.receiveShadow = true; this.scene.add(mesh); return mesh;
  }

  private buildStreet() {
    this.box(108, 0.35, 66, 0x304434, 0, -0.35, -8);
    this.box(90, 0.09, 12, 0x424957, 0, -0.1, 2.5);
    this.box(90, 0.12, 3.1, 0x9397a1, 0, -0.04, -5.1);
    this.box(90, 0.14, 0.23, 0xb4bcc8, 0, 0.015, -3.5);
    this.box(90, 0.1, 0.24, 0x8a949f, 0, 0, 8.2);
    for (let x = -43; x < 45; x += 6) this.box(2.2, 0.01, 0.1, 0xb6b2a0, x, -0.035, 2.7);
    const letters = ["b", "a", "d", "c", "f", "e"];
    for (let index = 0; index < 6; index++) {
      const x = -30 + index * 12;
      this.box(11.4, 0.03, 13, index % 2 ? 0x405340 : 0x465848, x, -0.04, -12.9);
      this.model(`city-kit-suburban/building-type-${letters[index]}.glb`, 8.5, x, -14.2);
      this.box(1.2, 0.05, 5.5, 0x8f969c, x + 1.9, 0.02, -8.2);
      this.model("city-kit-suburban/driveway-short.glb", 3.6, x - 3.6, -8.1);
      this.model("city-kit-suburban/planter.glb", 1.2, x + 3.4, -8.7);
      this.model("furniture-kit/trashcan.glb", 0.48, x + 4.1, -6.8);
      this.model("city-kit-suburban/tree-small.glb", 2.6, x + 4.7, -12.4);
      for (let i = 0; i < 3; i++) this.model("city-kit-suburban/fence-low.glb", 2.4, x - 4 + i * 2.5, -20);
    }
    this.model("car-kit/sedan.glb", 2.5, -17, -0.8, Math.PI / 2);
    this.model("car-kit/van.glb", 2.4, 19, -0.8, Math.PI / 2);
    for (const x of [-29, -9, 11, 31]) {
      this.model("city-kit-roads/light-curved.glb", 0.85, x, -3.9, Math.PI);
      const lamp = new THREE.PointLight(0xffd995, 90, 15, 1.4);
      lamp.position.set(x, 4.4, -3.7); this.scene.add(lamp); this.lamps.push(lamp);
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
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0x303742, roughness: 0.65 }));
    torch.rotation.x = Math.PI / 2; torch.position.set(-0.38, 0.95, 0.35); group.add(torch);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), new THREE.MeshBasicMaterial({ color: 0xffdd99 }));
    glass.position.set(-0.38, 0.95, 0.49); group.add(glass);
    const target = new THREE.Object3D();
    const light = new THREE.SpotLight(0xffd49a, 105, 15, 0.31, 0.5, 1.25);
    light.target = target; light.castShadow = player.id === this.localId;
    light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.001; light.shadow.normalBias = 0.04;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.05, 10, 16, 1, true), new THREE.MeshBasicMaterial({
      color: 0xffdba5, transparent: true, opacity: 0.055, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const mixer = new THREE.AnimationMixer(model);
    const idleClip = asset.animations.find(clip => clip.name === "idle");
    const walkClip = asset.animations.find(clip => clip.name === "walk");
    const idle = idleClip ? mixer.clipAction(idleClip) : undefined;
    const walk = walkClip ? mixer.clipAction(walkClip) : undefined;
    idle?.play();
    const label = document.createElement("span"); label.className = "player-label";
    label.dataset.player = player.id; this.container.append(label);
    this.scene.add(group, light, target, cone);
    const pose = this.fromPlayer(player);
    return { group, model, mixer, idle, walk, moving: false, light, target, cone, previous: pose, next: pose, received: performance.now(), label };
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
    this.ambient.intensity = this.blackout ? 0.12 : 0.7;
    this.moon.intensity = this.blackout ? 0.32 : 0.8;
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
    const moving = length > 0.08 && this.connected && !document.hidden;
    if (moving) {
      dx /= Math.max(length, 1); dz /= Math.max(length, 1);
      this.pose.x = THREE.MathUtils.clamp(this.pose.x + dx * MOVE_SPEED * dt, STREET_BOUNDS.minX, STREET_BOUNDS.maxX);
      this.pose.z = THREE.MathUtils.clamp(this.pose.z + dz * MOVE_SPEED * dt, STREET_BOUNDS.minZ, STREET_BOUNDS.maxZ);
      this.pose.facing = Math.atan2(dx, dz);
    }
    if (this.connected && !document.hidden && now - this.lastSend >= 50) {
      this.lastSend = now; this.pose.seq++; this.onPose({ ...this.pose });
    }
    const labelWidth = this.container.clientWidth, labelHeight = this.container.clientHeight;
    this.cameraFocus.lerp(new THREE.Vector3(this.pose.x, 0, this.pose.z - 6), 1 - Math.exp(-5 * dt));
    this.camera.position.set(this.cameraFocus.x + 9, 22, this.cameraFocus.z + 23);
    this.camera.lookAt(this.cameraFocus);
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
      const facing = figure.group.rotation.y;
      this.direction.set(Math.sin(facing), 0, Math.cos(facing));
      figure.light.position.copy(figure.group.position).add(new THREE.Vector3(0, 0.98, 0)).addScaledVector(this.direction, 0.4);
      figure.target.position.copy(figure.light.position).addScaledVector(this.direction, 11); figure.target.position.y = 0.05;
      const axis = figure.target.position.clone().sub(figure.light.position).normalize();
      figure.cone.position.copy(figure.light.position).addScaledVector(axis, 5);
      figure.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis);
      this.projected.copy(figure.group.position).add(new THREE.Vector3(0, 2, 0)).project(this.camera);
      figure.label.style.transform = `translate(${(this.projected.x * 0.5 + 0.5) * labelWidth}px,${(-this.projected.y * 0.5 + 0.5) * labelHeight}px) translate(-50%,-100%)`;
      figure.label.hidden = Math.abs(this.projected.x) > 1.05 || Math.abs(this.projected.y) > 1.05;
      observed[id] = { x: figure.group.position.x, z: figure.group.position.z, facing, seq: local ? this.pose.seq : figure.next.seq };
    }
    this.renderer.render(this.scene, this.camera);
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
      });
      this.frames = []; this.lastMetrics = now;
    }
    this.frame = requestAnimationFrame(this.animate);
  };

  private resizeCanvas() {
    const width = Math.max(this.container.clientWidth, 1), height = Math.max(this.container.clientHeight, 1);
    const aspect = width / height;
    const halfHeight = 11.5;
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
    for (const figure of this.figures.values()) { figure.mixer.stopAllAction(); figure.light.shadow.dispose(); figure.label.remove(); }
    this.releaseObject(this.scene); for (const asset of this.assets.values()) this.releaseObject(asset.scene);
    this.renderer.dispose(); this.renderer.domElement.remove(); this.stick.remove();
  }
}
