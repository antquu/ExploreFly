/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Point-cloud renderer of the central nervous system: one point per neuron soma,
// coloured live by the activity of its cell type.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Connectome } from '../data/connectome';

const TEX_W = 256;
const UNITS = 10 / 32768;

const KIND: Record<string, number> = {
  ol_intrinsic: 0, ol_sensory: 0, visual_projection: 1, visual_centrifugal: 1,
  cb_intrinsic: 2, cb_endocrine: 2, cb_sensory: 3, vnc_sensory: 3, sensory_ascending: 3,
  descending_neuron: 4, ascending_neuron: 5, vnc_intrinsic: 6, vnc_motor: 7, cb_motor: 7,
};

const KIND_COLORS = [
  [0.55, 0.6, 0.68], [0.5, 0.62, 0.8], [0.72, 0.72, 0.76], [0.6, 0.72, 0.62],
  [0.95, 0.78, 0.5], [0.75, 0.62, 0.9], [0.6, 0.6, 0.66], [0.9, 0.6, 0.55],
];

const vertex = /* glsl */ `
  uniform sampler2D uActivity;
  uniform sampler2D uFlags;
  uniform float uSize;
  uniform float uViewScale;
  uniform float uDim;
  uniform vec3 uKinds[8];
  attribute float aNode;
  attribute float aKind;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    int n = int(aNode);
    ivec2 uv = ivec2(n % ${TEX_W}, n / ${TEX_W});
    float a = clamp(texelFetch(uActivity, uv, 0).r, 0.0, 1.0);
    vec4 f = texelFetch(uFlags, uv, 0);
    vec3 base = uKinds[int(aKind)];
    vec3 hot = mix(vec3(0.25, 0.55, 1.0), vec3(1.0, 1.0, 1.0), smoothstep(0.45, 1.0, a));
    float dim = mix(1.0, 0.68, uDim * (1.0 - f.r) * (1.0 - smoothstep(0.05, 0.4, a)));
    vColor = mix(base * 0.7, hot, smoothstep(0.03, 0.6, a));
    vColor = mix(vColor, vec3(1.0, 0.82, 0.45), f.r * 0.85 * (1.0 - smoothstep(0.1, 0.6, a) * 0.6));
    vColor = mix(vColor, vec3(0.9, 0.3, 0.25), f.g);
    vAlpha = (0.42 + a * 0.58 + f.r * 0.5) * dim;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * uViewScale * (1.0 + a * 2.2 + f.r * 1.2) * (16.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float soft = smoothstep(0.25, 0.0, d);
    gl_FragColor = vec4(vColor * soft, vAlpha * soft);
  }
`;

export interface BrainSceneOptions {
  autoRotate?: boolean;
  quality?: 'low' | 'medium' | 'high';
  // Horizontal shift of the view, as a fraction of the width (leaves room for overlays)
  shiftX?: number;
  onPick?: (node: number | null) => void;
  onHover?: (node: number | null, x: number, y: number) => void;
}

export class BrainScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private activity: THREE.DataTexture;
  private flags: THREE.DataTexture;
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;
  private links: THREE.LineSegments;
  private positions: Float32Array;
  private pointNode: Uint32Array;
  private c: Connectome;
  private host: HTMLElement;
  private frame = 0;
  private active = true;
  private resumeTimer = 0;
  private allowRotate: boolean;
  private resizeObs: ResizeObserver;
  private opts: BrainSceneOptions;
  private downAt: [number, number] | null = null;
  private lastHover = 0;
  private home = new THREE.Vector3();

  constructor(host: HTMLElement, c: Connectome, opts: BrainSceneOptions = {}) {
    this.host = host;
    this.c = c;
    this.opts = opts;
    this.allowRotate = opts.autoRotate ?? true;
    const quality = opts.quality ?? 'high';

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 1.5 : 1));
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotate = this.allowRotate;
    this.controls.autoRotateSpeed = 0.9;
    this.controls.enablePan = true;
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
      clearTimeout(this.resumeTimer);
    });
    // Rotation resumes a few seconds after the user lets go
    this.controls.addEventListener('end', () => {
      clearTimeout(this.resumeTimer);
      if (this.allowRotate) this.resumeTimer = window.setTimeout(() => (this.controls.autoRotate = true), 6000);
    });

    const n = c.nodes.length;
    const rows = Math.ceil(n / TEX_W);
    this.activity = new THREE.DataTexture(new Float32Array(TEX_W * rows), TEX_W, rows, THREE.RedFormat, THREE.FloatType);
    this.activity.needsUpdate = true;
    this.flags = new THREE.DataTexture(new Uint8Array(TEX_W * rows * 4), TEX_W, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.flags.needsUpdate = true;

    // Low quality keeps one soma in three
    const step = quality === 'low' ? 3 : quality === 'medium' ? 2 : 1;
    const { xyz, node, count } = c.points;
    const kept = Math.ceil(count / step);
    this.positions = new Float32Array(kept * 3);
    this.pointNode = new Uint32Array(kept);
    const aNode = new Float32Array(kept);
    const aKind = new Float32Array(kept);
    for (let i = 0, j = 0; i < count; i += step, j++) {
      this.positions[j * 3] = xyz[i * 3] * UNITS;
      this.positions[j * 3 + 1] = -xyz[i * 3 + 1] * UNITS;
      this.positions[j * 3 + 2] = -xyz[i * 3 + 2] * UNITS;
      this.pointNode[j] = node[i];
      aNode[j] = node[i];
      aKind[j] = KIND[c.nodes[node[i]].sc.replace(/_tbc$/, '')] ?? 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aNode', new THREE.BufferAttribute(aNode, 1));
    geo.setAttribute('aKind', new THREE.BufferAttribute(aKind, 1));
    geo.computeBoundingSphere();

    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uActivity: { value: this.activity },
        uFlags: { value: this.flags },
        uSize: { value: (quality === 'low' ? 2.6 : quality === 'medium' ? 2.2 : 1.8) * this.renderer.getPixelRatio() },
        uDim: { value: 0 },
        uViewScale: { value: 1 },
        uKinds: { value: KIND_COLORS.map(([r, g, b]) => new THREE.Vector3(r, g, b)) },
      },
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // Frames the brain from a three-quarter front view; the VNC trails behind it
    const center = new THREE.Vector3();
    let inBrain = 0;
    for (let j = 0; j < kept; j++) {
      if (/^vnc/.test(c.nodes[this.pointNode[j]].sc)) continue;
      center.x += this.positions[j * 3];
      center.y += this.positions[j * 3 + 1];
      center.z += this.positions[j * 3 + 2];
      inBrain++;
    }
    center.divideScalar(Math.max(1, inBrain));
    this.home = center.clone();
    const radius = 8.2;
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(0.45, 0.22, 1).normalize().multiplyScalar(dist));
    this.controls.minDistance = radius * 0.35;
    this.controls.maxDistance = dist * 2;

    this.links = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.scene.add(this.links);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => (this.downAt = [e.clientX, e.clientY]));
    canvas.addEventListener('pointerup', (e) => {
      if (!this.downAt || Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) > 4) return;
      this.opts.onPick?.(this.pick(e.clientX, e.clientY));
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.opts.onHover || e.buttons) return;
      const now = performance.now();
      if (now - this.lastHover < 70) return;
      this.lastHover = now;
      this.opts.onHover(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerleave', () => this.opts.onHover?.(null, 0, 0));

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    this.loop();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    // Points keep the same apparent density on large canvases
    this.material.uniforms.uViewScale.value = Math.max(1, Math.sqrt(h / 560));
    const shift = this.opts.shiftX ?? 0;
    if (shift) this.camera.setViewOffset(w, h, -w * shift, 0, w, h);
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    if (!this.active || document.hidden) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  setActive(active: boolean) {
    this.active = active;
    if (active) this.resize();
  }

  setAutoRotate(on: boolean) {
    this.allowRotate = on;
    this.controls.autoRotate = on;
  }

  setActivity(rate: Float32Array) {
    (this.activity.image.data as Float32Array).set(rate);
    this.activity.needsUpdate = true;
  }

  // Highlighted nodes glow gold, silenced ones turn red; others dim when something is highlighted
  setFlags(highlight: Iterable<number>, silenced: Uint8Array) {
    const data = this.flags.image.data as Uint8Array;
    data.fill(0);
    let any = false;
    for (const i of highlight) {
      data[i * 4] = 255;
      any = true;
    }
    for (let i = 0; i < silenced.length; i++) if (silenced[i]) data[i * 4 + 1] = 255;
    this.flags.needsUpdate = true;
    this.material.uniforms.uDim.value = any ? 1 : 0;
  }

  // Draws connections from one node to its strongest partners
  setLinks(from: number | null, partners: { node: number; strength: number; out: boolean }[] = []) {
    const geo = new THREE.BufferGeometry();
    const p0 = from !== null ? this.c.nodes[from].p : null;
    if (p0) {
      const pos: number[] = [];
      const col: number[] = [];
      const max = Math.max(1, ...partners.map((x) => x.strength));
      for (const { node, strength, out } of partners) {
        const p1 = this.c.nodes[node].p;
        if (!p1) continue;
        const s = 0.25 + 0.75 * (strength / max);
        pos.push(p0[0] * UNITS, -p0[1] * UNITS, -p0[2] * UNITS, p1[0] * UNITS, -p1[1] * UNITS, -p1[2] * UNITS);
        const c = out ? [1, 0.8, 0.45] : [0.35, 0.65, 1];
        col.push(c[0] * s, c[1] * s, c[2] * s, c[0] * s * 0.4, c[1] * s * 0.4, c[2] * s * 0.4);
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    }
    this.links.geometry.dispose();
    this.links.geometry = geo;
  }

  // Centres the camera on a node, keeping the current viewing direction
  focus(node: number | null) {
    const p = node !== null ? this.c.nodes[node].p : null;
    const target = p
      ? new THREE.Vector3(p[0] * UNITS, -p[1] * UNITS, -p[2] * UNITS)
      : this.home.clone();
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(offset);
  }

  // Nearest soma under the cursor, within a few pixels
  pick(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const w = rect.width, h = rect.height;
    const m = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    const e = m.elements;
    let best = 64, bestNode: number | null = null, bestDepth = Infinity;
    const pos = this.positions;
    for (let i = 0, n = this.pointNode.length; i < n; i++) {
      const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
      const cw = e[3] * px + e[7] * py + e[11] * pz + e[15];
      if (cw <= 0) continue;
      const sx = ((e[0] * px + e[4] * py + e[8] * pz + e[12]) / cw * 0.5 + 0.5) * w;
      const sy = (1 - ((e[1] * px + e[5] * py + e[9] * pz + e[13]) / cw * 0.5 + 0.5)) * h;
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      if (d < best || (d < 16 && cw < bestDepth)) {
        best = d;
        bestDepth = cw;
        bestNode = this.pointNode[i];
      }
    }
    return bestNode;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.resumeTimer);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.points.geometry.dispose();
    this.material.dispose();
    this.activity.dispose();
    this.flags.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
