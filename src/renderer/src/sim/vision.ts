/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Compound eye model. Samples a frame on a coarse grid of ommatidia (one half per eye)
// with fly spectral weights (no red channel), then extracts the features the early
// visual system is known to compute:
// - ON / OFF luminance changes (L1 and L2 pathways)
// - local direction of motion with a Hassenstein-Reichardt correlator (T4 / T5)
// - looming, as a fast growth of the dark area (LC4, LPLC2)
// - small moving targets (LC11, LC10)

export const COLS = 18;
export const ROWS = 16;
const CELLS = COLS * 2 * ROWS;

export interface EyeFeatures {
  lum: number;
  uv: number;
  green: number;
  on: number;
  off: number;
  ftb: number;
  btf: number;
  up: number;
  down: number;
  loom: number;
  target: number;
  targetX: number;
  targetY: number;
}

export interface VisionOutput {
  left: EyeFeatures;
  right: EyeFeatures;
  // Brightest / most contrasted azimuth in [-1, 1], used for fixation
  barX: number;
  motion: number;
}

// Maps an ommatidium (column 0..2*COLS-1 from left to right, row 0..ROWS-1 from top) to frame pixels
export type Sampler = (col: number, row: number, out: [number, number]) => void;

export interface FrameSource {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
  bgra?: boolean;
}

const emptyEye = (): EyeFeatures => ({
  lum: 0, uv: 0, green: 0, on: 0, off: 0, ftb: 0, btf: 0, up: 0, down: 0, loom: 0, target: 0, targetX: 0, targetY: 0,
});

export class CompoundEye {
  readonly lum = new Float32Array(CELLS);
  readonly uv = new Float32Array(CELLS);
  readonly green = new Float32Array(CELLS);
  private mh = new Float32Array(CELLS);
  private mv = new Float32Array(CELLS);
  private slow = new Float32Array(CELLS);
  private hp = new Float32Array(CELLS);
  private hpDelayed = new Float32Array(CELLS);
  private prev = new Float32Array(CELLS);
  private dark = [0, 0];
  private loomState = [0, 0];
  private ready = false;
  private p: [number, number] = [0, 0];

  reset() {
    this.ready = false;
    this.loomState = [0, 0];
  }

  // Full-screen sampler: the fly faces the media, left half to the left eye
  static screen(width: number, height: number, jitterX = 0, jitterY = 0): Sampler {
    return (col, row, out) => {
      out[0] = ((col + 0.5) / (COLS * 2)) * width + jitterX;
      out[1] = ((row + 0.5) / ROWS) * height + jitterY;
    };
  }

  // Sampler for a fly standing on the page at (x, y) with a heading in radians (0 = up)
  static walker(x: number, y: number, heading: number, radius: number): Sampler {
    const cos = Math.cos(heading), sin = Math.sin(heading);
    return (col, row, out) => {
      const lateral = ((col + 0.5) / (COLS * 2) - 0.5) * 2 * radius;
      const ahead = (1 - (row + 0.5) / ROWS) * radius * 1.4 - radius * 0.2;
      out[0] = x + lateral * cos + ahead * sin;
      out[1] = y + lateral * sin - ahead * cos;
    };
  }

  process(frame: FrameSource, sampler: Sampler, dt: number): VisionOutput {
    const { width, height, data } = frame;
    const ri = frame.bgra ? 2 : 0, bi = frame.bgra ? 0 : 2;
    const W = COLS * 2;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < W; col++) {
        const i = row * W + col;
        sampler(col, row, this.p);
        // 3x3 box around the sample point blurs like the ommatidial acceptance angle
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = Math.round(this.p[0] + dx * 1.5), y = Math.round(this.p[1] + dy * 1.5);
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const k = (y * width + x) * 4;
            r += data[k + ri]; g += data[k + 1]; b += data[k + bi]; n++;
          }
        }
        if (n === 0) { this.lum[i] = 0.05; this.uv[i] = 0; this.green[i] = 0; continue; }
        r /= n * 255; g /= n * 255; b /= n * 255;
        this.lum[i] = 0.05 * r + 0.55 * g + 0.4 * b;
        this.uv[i] = b;
        this.green[i] = g;
      }
    }

    if (!this.ready) {
      this.slow.set(this.lum);
      this.prev.set(this.lum);
      this.hpDelayed.fill(0);
      this.ready = true;
    }

    // Photoreceptor adaptation (high-pass) then the correlator's low-pass delay
    const kd = Math.min(1, dt / 0.06);
    const ks = Math.min(1, dt / 0.8);
    for (let i = 0; i < CELLS; i++) {
      this.slow[i] += (this.lum[i] - this.slow[i]) * ks;
      this.hp[i] = this.lum[i] - this.slow[i];
    }

    const eyes = [emptyEye(), emptyEye()];
    let motionTotal = 0;
    const colEnergy = new Float32Array(W);
    const mh = this.mh, mv = this.mv;
    for (let e = 0; e < 2; e++) {
      const eye = eyes[e];
      const c0 = e * COLS, c1 = c0 + COLS;
      let hx = 0, vy = 0, nh = 0, nv = 0, darkCount = 0, cx = 0, cy = 0;
      let bestLocal = 0, meanLocal = 0, bestX = 0, bestY = 0;
      for (let row = 0; row < ROWS; row++) {
        for (let col = c0; col < c1; col++) {
          const i = row * W + col;
          const l = this.lum[i];
          eye.lum += l;
          eye.uv += this.uv[i];
          eye.green += this.green[i];
          const d = l - this.prev[i];
          if (d > 0) eye.on += d; else eye.off -= d;
          if (l < 0.22) { darkCount++; cx += col; cy += row; }
          mh[i] = 0;
          mv[i] = 0;
          if (col + 1 < c1) {
            const j = i + 1;
            mh[i] = this.hpDelayed[i] * this.hp[j] - this.hp[i] * this.hpDelayed[j];
            hx += mh[i]; nh++;
            colEnergy[col] += Math.abs(l - this.lum[j]);
          }
          if (row + 1 < ROWS) {
            const j = i + W;
            mv[i] = this.hpDelayed[i] * this.hp[j] - this.hp[i] * this.hpDelayed[j];
            vy += mv[i]; nv++;
          }
          const local = Math.abs(mh[i]) + Math.abs(mv[i]);
          meanLocal += local;
          if (local > bestLocal) {
            bestLocal = local;
            bestX = (col + 0.5) / W;
            bestY = (row + 0.5) / ROWS;
          }
        }
      }

      // Looming: motion pointing away from the centre of the dark area.
      // A translating pattern moves out on one side and in on the other, so it cancels.
      let expansion = 0;
      if (darkCount > 0) {
        cx /= darkCount;
        cy /= darkCount;
        for (let row = 0; row < ROWS; row++) {
          for (let col = c0; col < c1; col++) {
            const i = row * W + col;
            const dx = col - cx, dy = row - cy;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.5) continue;
            expansion += (mh[i] * dx + mv[i] * dy) / dist;
          }
        }
      }
      const cells = COLS * ROWS;
      eye.lum /= cells; eye.uv /= cells; eye.green /= cells;
      eye.on /= cells; eye.off /= cells;
      hx = nh ? (hx / nh) * 60 : 0;
      vy = nv ? (vy / nv) * 60 : 0;
      // Front-to-back is leftward on the left eye and rightward on the right eye
      const ftb = e === 0 ? -hx : hx;
      eye.ftb = Math.max(0, ftb);
      eye.btf = Math.max(0, -ftb);
      eye.up = Math.max(0, -vy);
      eye.down = Math.max(0, vy);
      meanLocal /= cells;
      eye.target = Math.max(0, bestLocal - 2.5 * meanLocal) * 40;
      eye.targetX = bestX * 2 - 1;
      eye.targetY = bestY * 2 - 1;
      motionTotal += Math.abs(hx) + Math.abs(vy);

      const darkFrac = darkCount / cells;
      const growth = (darkFrac - this.dark[e]) / Math.max(dt, 1e-3);
      this.dark[e] = darkFrac;
      const translation = (Math.abs(hx) + Math.abs(vy)) / 60;
      const radial = expansion / cells - 1.5 * translation;
      const loom = growth > 0 ? Math.max(0, radial) * 120 * Math.min(1, growth * 4) : 0;
      this.loomState[e] += (loom - this.loomState[e]) * Math.min(1, dt / 0.12);
      eye.loom = this.loomState[e];
    }

    // Fixation target: column with the strongest vertical edges
    let best = 0, bestCol = W / 2;
    for (let col = 0; col < W; col++) {
      if (colEnergy[col] > best) { best = colEnergy[col]; bestCol = col; }
    }

    for (let i = 0; i < CELLS; i++) {
      this.hpDelayed[i] += (this.hp[i] - this.hpDelayed[i]) * kd;
    }
    this.prev.set(this.lum);

    return {
      left: eyes[0],
      right: eyes[1],
      barX: best > 0.4 ? ((bestCol + 0.5) / W) * 2 - 1 : 0,
      motion: motionTotal,
    };
  }
}
