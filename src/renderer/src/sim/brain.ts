/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Firing-rate model running on the type-level connectome.
// Each node integrates its strongest inputs, signed by the presynaptic transmitter,
// through a rectified tanh with slow adaptation:
//   tau dr/dt = -r + tanh(g * sum(w * sign * r_pre) + I - a - theta)+
//   tau_a da/dt = k * r - a
import type { Connectome } from '../data/connectome';

const NT_SIGN: Record<string, number> = {
  acetylcholine: 1,
  gaba: -1,
  glutamate: -0.85,
  histamine: -1,
  dopamine: 0.4,
  serotonin: 0.35,
  octopamine: 0.4,
  tyramine: 0.3,
};

export interface BrainParams {
  gain: number;
  theta: number;
  tau: number;
  tauAdapt: number;
  adapt: number;
  noise: number;
}

export const DEFAULT_PARAMS: BrainParams = {
  gain: 3.2,
  theta: 0.04,
  tau: 0.045,
  tauAdapt: 1.2,
  adapt: 0.7,
  noise: 0.004,
};

export class Brain {
  readonly n: number;
  readonly rate: Float32Array;
  readonly input: Float32Array;
  readonly silenced: Uint8Array;
  readonly clamped: Float32Array;
  params: BrainParams = { ...DEFAULT_PARAMS };
  private drive: Float32Array;
  private adaptState: Float32Array;
  private outOffsets: Uint32Array;
  private outDst: Uint32Array;
  private outW: Float32Array;

  constructor(c: Connectome) {
    this.n = c.nodes.length;
    this.rate = new Float32Array(this.n);
    this.drive = new Float32Array(this.n);
    this.input = new Float32Array(this.n);
    this.adaptState = new Float32Array(this.n);
    this.silenced = new Uint8Array(this.n);
    this.clamped = new Float32Array(this.n).fill(-1);
    const sign = c.nodes.map((node) => (node.nt ? NT_SIGN[node.nt] ?? 0.5 : 0.5));

    // Outgoing edges with the transmitter sign folded in, so activity is pushed
    // only from active neurons (activity is sparse, the graph is not)
    const { offsets, src, weight } = c;
    const E = src.length;
    this.outOffsets = new Uint32Array(this.n + 1);
    for (let k = 0; k < E; k++) this.outOffsets[src[k] + 1]++;
    for (let i = 0; i < this.n; i++) this.outOffsets[i + 1] += this.outOffsets[i];
    const fill = this.outOffsets.slice(0, this.n);
    this.outDst = new Uint32Array(E);
    this.outW = new Float32Array(E);
    for (let z = 0; z < this.n; z++) {
      for (let k = offsets[z]; k < offsets[z + 1]; k++) {
        const pre = src[k];
        const slot = fill[pre]++;
        this.outDst[slot] = z;
        this.outW[slot] = weight[k] * sign[pre];
      }
    }
  }

  reset() {
    this.rate.fill(0);
    this.adaptState.fill(0);
    this.input.fill(0);
  }

  // Advances the network by dt seconds, in sub-steps of at most 35 ms
  step(dt: number) {
    const steps = Math.max(1, Math.ceil(dt / 0.035));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) this.substep(h);
  }

  private substep(h: number) {
    const { gain, theta, tau, tauAdapt, adapt, noise } = this.params;
    const r = this.rate, u = this.drive, a = this.adaptState;
    const outOffsets = this.outOffsets, outDst = this.outDst, outW = this.outW;
    const kr = Math.min(1, h / tau);
    const ka = Math.min(1, h / tauAdapt);
    u.fill(0);
    for (let pre = 0; pre < this.n; pre++) {
      const v = r[pre];
      if (v < 1e-3) continue;
      for (let k = outOffsets[pre], end = outOffsets[pre + 1]; k < end; k++) u[outDst[k]] += outW[k] * v;
    }
    for (let z = 0; z < this.n; z++) {
      if (this.silenced[z]) {
        r[z] = 0;
      } else if (this.clamped[z] >= 0) {
        r[z] = this.clamped[z];
      } else {
        const drive = gain * u[z] + this.input[z] - a[z] - theta + (Math.random() - 0.5) * noise;
        const target = drive > 0 ? Math.tanh(drive) : 0;
        r[z] += (target - r[z]) * kr;
      }
      a[z] += (adapt * r[z] - a[z]) * ka;
    }
  }

  // Indices of the most active nodes, highest first
  top(count: number, filter?: (i: number) => boolean): number[] {
    const best: number[] = [];
    const r = this.rate;
    for (let i = 0; i < this.n; i++) {
      if (r[i] < 0.02 || (filter && !filter(i))) continue;
      if (best.length < count) {
        best.push(i);
        best.sort((x, y) => r[y] - r[x]);
      } else if (r[i] > r[best[count - 1]]) {
        best[count - 1] = i;
        best.sort((x, y) => r[y] - r[x]);
      }
    }
    return best;
  }

  mean(indices: number[]): number {
    if (!indices.length) return 0;
    let s = 0;
    for (const i of indices) s += this.rate[i];
    return s / indices.length;
  }
}
