import * as THREE from "three";
import type { Snapshot, Role, PlayerPose, Beam } from "../../shared/protocol";

/** Procedural stand-ins. Replace house groups with authored glTF assets later. */
export class HouseWorld {
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(65, 1, 0.1, 100);
  private keys = new Set<string>();
  private pose: PlayerPose = { x: 0, z: 1.5, yaw: 0 };
  private pitch = 0;
  private avatar = new THREE.Group();
  private neighbor = new THREE.Group();
  private flashlight = new THREE.Group();
  private light = new THREE.SpotLight(0xffe1a0, 18, 28, 0.5, 0.65, 1);
  private snapshot!: Snapshot;
  private frame = 0;
  private last = performance.now();
  private sent = 0;
  private dragging = false;
  private disposed = false;
  private observer: ResizeObserver;
  private abort = new AbortController();
  private remote: PlayerPose = { x: 0, z: 1.5, yaw: 0 };
  private friendLight = new THREE.SpotLight(0xffbf69, 25, 30, 0.25, 0.7, 1);
  private prompt = document.createElement("button");
  constructor(
    private host: HTMLElement,
    snapshot: Snapshot,
    private send: (pose: PlayerPose) => void,
    private interact: (id: string) => void,
    private shine: (x: number, y: number) => void,
  ) {
    this.snapshot = snapshot;
    this.pose = { ...(snapshot.poses?.[snapshot.you.role!] ?? this.pose) };
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x172c45);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute(
      "aria-label",
      "3D house. WASD or arrows to walk. Drag to look. E to pick up nearby flashlight. Escape releases controls.",
    );
    canvas.dataset.testid = "house-canvas";
    this.host.append(canvas);
    this.prompt.className = "world-pickup";
    this.prompt.dataset.testid = "world-pickup";
    this.prompt.textContent = "E · Pick up flashlight";
    this.host.append(this.prompt);
    const hint = document.createElement("p");
    hint.className = "world-controls";
    hint.textContent =
      "WASD / arrows · Drag to look · E interact · Esc release";
    this.host.append(hint);
    const pad = document.createElement("div");
    pad.className = "world-pad";
    for (const [label, key] of [
      ["↑", "w"],
      ["←", "a"],
      ["↓", "s"],
      ["→", "d"],
    ]) {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute(
        "aria-label",
        `Walk ${key === "w" ? "forward" : key === "s" ? "backward" : key === "a" ? "left" : "right"}`,
      );
      b.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        b.setPointerCapture(ev.pointerId);
        this.keys.add(key);
      });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        b.addEventListener(event, () => this.keys.delete(key));
      pad.append(b);
    }
    this.host.append(pad);
    this.scene.add(new THREE.HemisphereLight(0xb8d9ff, 0x60463d, 2));
    const moon = new THREE.DirectionalLight(0xbdd8ff, 2);
    moon.position.set(-8, 12, -8);
    this.scene.add(moon);
    this.scene.fog = new THREE.Fog(0x172c45, 25, 70);
    this.box(this.scene, 100, 0.2, 100, 0, -0.2, -8, 0x29473e);
    this.box(this.scene, 16, 0.05, 6, 0, -0.05, -8, 0x303947);
    for (let x = -7; x < 8; x += 3)
      this.box(this.scene, 1.2, 0.02, 0.12, x, -0.01, -8, 0xc3b69b);
    const home = this.house(snapshot.you.role === "alex" ? 0xc38e65 : 0x759bad);
    this.scene.add(home);
    this.neighbor = this.house(
      snapshot.you.role === "alex" ? 0x759bad : 0xc38e65,
    );
    this.neighbor.position.z = -16;
    this.neighbor.rotation.y = Math.PI;
    this.scene.add(this.neighbor);
    this.scene.add(this.friendLight, this.friendLight.target);
    for (const [x, z] of [
      [-8, -12],
      [8, -19],
      [-10, 4],
      [10, -2],
    ]) {
      this.box(this.scene, 0.35, 3, 0.35, x, 1.4, z, 0x655244);
      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2, 1),
        new THREE.MeshStandardMaterial({ color: 0x456653, roughness: 1 }),
      );
      crown.position.set(x, 3.5, z);
      this.scene.add(crown);
    }
    this.box(this.avatar, 0.46, 0.75, 0.3, 0, 0.85, 0, 0xe8a860);
    this.box(this.avatar, 0.35, 0.35, 0.35, 0, 1.42, 0, 0xf1c6a2);
    this.box(this.avatar, 0.38, 0.12, 0.38, 0, 1.62, 0, 0x342f36);
    for (const x of [-0.14, 0.14])
      this.box(this.avatar, 0.16, 0.5, 0.2, x, 0.25, 0, 0x334c70);
    this.neighbor.add(this.avatar);
    this.box(this.flashlight, 0.32, 0.12, 0.12, 0, 0, 0, 0xe5bd60);
    this.flashlight.position.set(-2, 0.85, -1);
    this.scene.add(this.flashlight);
    this.scene.add(this.camera);
    this.camera.add(this.light);
    this.light.target.position.set(0, 0, -10);
    this.camera.add(this.light.target);
    const options = { signal: this.abort.signal };
    canvas.addEventListener(
      "pointerdown",
      (ev) => {
        canvas.focus();
        this.dragging = true;
        canvas.setPointerCapture(ev.pointerId);
      },
      options,
    );
    canvas.addEventListener(
      "pointerup",
      () => (this.dragging = false),
      options,
    );
    canvas.addEventListener(
      "pointercancel",
      () => (this.dragging = false),
      options,
    );
    canvas.addEventListener(
      "lostpointercapture",
      () => (this.dragging = false),
      options,
    );
    canvas.addEventListener(
      "pointermove",
      (ev) => {
        if (!this.dragging) return;
        this.pose.yaw -= ev.movementX * 0.006;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch - ev.movementY * 0.006,
          -0.9,
          0.9,
        );
      },
      options,
    );
    canvas.addEventListener(
      "keydown",
      (ev) => {
        if (
          [
            "w",
            "a",
            "s",
            "d",
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
          ].includes(ev.key)
        ) {
          ev.preventDefault();
          this.keys.add(ev.key);
        }
        if (ev.key.toLowerCase() === "e") this.pickup();
        if (ev.key === "Escape") {
          this.keys.clear();
          canvas.blur();
        }
      },
      options,
    );
    window.addEventListener("keyup", (ev) => this.keys.delete(ev.key), options);
    const release = () => {
      this.keys.clear();
      this.dragging = false;
    };
    window.addEventListener("blur", release, options);
    canvas.addEventListener("blur", release, options);
    document.addEventListener("visibilitychange", release, options);
    this.prompt.addEventListener("click", () => this.pickup(), options);
    this.observer = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      this.camera.aspect = w / Math.max(h, 1);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
    this.observer.observe(host);
    this.update(snapshot);
    this.loop();
  }
  private box(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: number,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
    );
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  private house(color: number) {
    const g = new THREE.Group();
    this.box(g, 8, 0.15, 6, 0, -0.08, 0, 0xb59270);
    this.box(g, 0.2, 3, 6, -4, 1.5, 0, color);
    this.box(g, 0.2, 3, 6, 4, 1.5, 0, color);
    this.box(g, 8, 3, 0.2, 0, 1.5, 3, color);
    // Window opening: real geometry rather than an opaque wall with a decal.
    for (const x of [-2.7, 2.7]) this.box(g, 2.6, 3, 0.2, x, 1.5, -3, color);
    this.box(g, 2.8, 0.8, 0.2, 0, 0.4, -3, color);
    this.box(g, 2.8, 0.5, 0.2, 0, 2.75, -3, color);
    this.box(g, 2.9, 0.12, 0.4, 0, 0.84, -3, 0xf0dcc1);
    for (const x of [-1.4, 1.4])
      this.box(g, 0.1, 1.7, 0.22, x, 1.65, -3, 0xf0dcc1);
    this.box(g, 0.07, 1.7, 0.15, 0, 1.65, -3, 0xf0dcc1);
    this.box(g, 8.5, 0.25, 6.5, 0, 3.1, 0, 0x454e62);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 4),
      new THREE.MeshStandardMaterial({ color: 0x454e62, roughness: 1 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(6.1, 1.6, 4.8);
    roof.position.y = 3.8;
    g.add(roof);
    this.box(g, 1.4, 0.5, 2.4, 2.5, 0.3, 1, 0x634c45);
    this.box(g, 1.4, 0.18, 2.4, 2.5, 0.63, 1, 0x829d95);
    this.box(g, 1.1, 0.16, 0.5, 2.5, 0.8, 1.85, 0xe5d7b9);
    this.box(g, 1.3, 0.8, 0.8, -2, 0.4, -1, 0x695241);
    this.box(g, 1.5, 2.1, 0.55, -2.9, 1.05, 2.55, 0x725b48);
    for (let i = 0; i < 5; i++)
      this.box(
        g,
        0.18,
        0.5,
        0.3,
        -3.4 + i * 0.22,
        1.5,
        2.2,
        [0x668b9b, 0xce9f65, 0x958c9e][i % 3],
      );
    const glow = new THREE.PointLight(0xffd09a, 8, 12);
    glow.position.set(-1, 2.4, 0);
    g.add(glow);
    return g;
  }
  update(snapshot: Snapshot) {
    if (snapshot.paused) {
      this.keys.clear();
      this.dragging = false;
    }
    this.snapshot = snapshot;
    const partner: Role = snapshot.you.role === "alex" ? "sam" : "alex";
    this.remote = snapshot.poses?.[partner] ?? this.remote;
    this.avatar.visible = snapshot.players.some(
      (p) => p.role === partner && p.connected,
    );
    this.flashlight.visible = !snapshot.inventory.includes(
      `flashlight-${snapshot.you.role}`,
    );
    this.light.visible = !this.flashlight.visible;
  }
  receive(role: Role, pose: PlayerPose) {
    if (role !== this.snapshot.you.role) this.remote = pose;
  }
  receiveBeam(role: Role, beam: Beam) {
    this.snapshot.beams[role] = beam;
  }
  private nearby() {
    return Math.hypot(this.pose.x + 2, this.pose.z + 1) < 1.65;
  }
  private pickup() {
    if (
      this.nearby() &&
      this.snapshot.phase === "flashlights" &&
      !this.snapshot.paused &&
      this.flashlight.visible
    )
      this.interact(`flashlight-${this.snapshot.you.role}`);
  }
  private blocked(x: number, z: number) {
    return (
      Math.abs(x) > 3.7 ||
      Math.abs(z) > 2.7 ||
      (x > 1.5 && x < 3.5 && z > -0.5 && z < 2.5) ||
      (x > -2.9 && x < -1.1 && z > -1.7 && z < -0.3) ||
      (x < -1.9 && z > 1.9)
    );
  }
  private loop = () => {
    if (this.disposed) return;
    const now = performance.now(),
      dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (!this.snapshot.paused && !document.hidden) {
      let forward =
        Number(this.keys.has("w") || this.keys.has("ArrowUp")) -
        Number(this.keys.has("s") || this.keys.has("ArrowDown"));
      let side =
        Number(this.keys.has("d") || this.keys.has("ArrowRight")) -
        Number(this.keys.has("a") || this.keys.has("ArrowLeft"));
      const length = Math.hypot(forward, side) || 1;
      forward /= length;
      side /= length;
      const x =
        this.pose.x +
        (side * Math.cos(this.pose.yaw) - forward * Math.sin(this.pose.yaw)) *
          dt *
          2.5;
      const z =
        this.pose.z +
        (-side * Math.sin(this.pose.yaw) - forward * Math.cos(this.pose.yaw)) *
          dt *
          2.5;
      if (!this.blocked(x, this.pose.z)) this.pose.x = x;
      if (!this.blocked(this.pose.x, z)) this.pose.z = z;
      if (now - this.sent > 100) {
        this.sent = now;
        this.send({ ...this.pose });
        if (!this.flashlight.visible)
          this.shine(
            (Math.sin(this.pose.yaw) + 1) / 2,
            (1 - Math.sin(this.pitch)) / 2,
          );
      }
    }
    this.camera.position.set(this.pose.x, 1.65, this.pose.z);
    this.camera.rotation.set(this.pitch, this.pose.yaw, 0, "YXZ");
    this.avatar.position.lerp(
      new THREE.Vector3(this.remote.x, 0, this.remote.z),
      0.2,
    );
    this.avatar.rotation.y = this.remote.yaw;
    const partner: Role = this.snapshot.you.role === "alex" ? "sam" : "alex";
    const beam = this.snapshot.beams[partner];
    this.friendLight.visible = beam.on && this.avatar.visible;
    this.friendLight.position.set(-this.remote.x, 1.1, -16 - this.remote.z);
    this.friendLight.target.position.set(
      (beam.x - 0.5) * 8,
      (1 - beam.y) * 3,
      0,
    );
    this.prompt.hidden =
      !this.nearby() ||
      !this.flashlight.visible ||
      this.snapshot.phase !== "flashlights";
    this.host.dataset.x = this.pose.x.toFixed(3);
    this.host.dataset.z = this.pose.z.toFixed(3);
    this.host.dataset.friendX = this.remote.x.toFixed(3);
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.loop);
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.observer.disconnect();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
    this.host.replaceChildren();
  }
}
