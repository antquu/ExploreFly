/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Synthetic stimuli for the lab: classic protocols from fly vision experiments,
// plus chemical and touch stimuli injected straight into sensory neurons.
import type { ChemicalStimulus } from './fly';
import type { FrameSource } from './vision';

export type VisualStimulus = 'loomL' | 'loomR' | 'gratingL' | 'gratingR' | 'target' | 'flash';
export type StimulusKind = VisualStimulus | ChemicalStimulus;

export const STIMULUS_LABEL: Record<StimulusKind, string> = {
  loomL: 'Looming object (left)',
  loomR: 'Looming object (right)',
  gratingL: 'Stripes moving left',
  gratingR: 'Stripes moving right',
  target: 'Small moving target',
  flash: 'Light flash',
  vinegar: 'Vinegar odour',
  cva: 'cVA pheromone',
  co2: 'CO₂ (alarm)',
  sugar: 'Taste (labellum)',
  touch: 'Touch (legs)',
};

export const VISUAL: VisualStimulus[] = ['loomL', 'loomR', 'gratingL', 'gratingR', 'target', 'flash'];
export const CHEMICAL: ChemicalStimulus[] = ['vinegar', 'cva', 'co2', 'sugar', 'touch'];

export const isVisual = (k: StimulusKind): k is VisualStimulus => (VISUAL as string[]).includes(k);

const W = 256, H = 160;

export class StimulusPlayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  kind: VisualStimulus | null = null;
  private t = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.draw();
  }

  play(kind: VisualStimulus | null) {
    this.kind = kind;
    this.t = 0;
  }

  // Draws the current stimulus and returns its pixels
  frame(dt: number): FrameSource {
    this.t += dt;
    this.draw();
    const img = this.ctx.getImageData(0, 0, W, H);
    return { width: W, height: H, data: img.data };
  }

  get time() {
    return this.t;
  }

  private draw() {
    const g = this.ctx, t = this.t;
    g.fillStyle = '#c8c8c8';
    g.fillRect(0, 0, W, H);
    switch (this.kind) {
      case 'loomL':
      case 'loomR': {
        // Approach at constant speed: angular size grows like 1 / (time to contact)
        const cycle = t % 3;
        const ttc = Math.max(0.04, 1.6 - cycle);
        const r = Math.min(W, 6 / ttc);
        g.fillStyle = '#0a0a0a';
        g.beginPath();
        g.arc(this.kind === 'loomL' ? W * 0.25 : W * 0.75, H / 2, r, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'gratingL':
      case 'gratingR': {
        const dir = this.kind === 'gratingR' ? 1 : -1;
        const period = 40;
        const shift = (((t * 70 * dir) % period) + period) % period;
        g.fillStyle = '#111';
        for (let x = -period + shift; x < W; x += period) g.fillRect(x, 0, period / 2, H);
        break;
      }
      case 'target': {
        const x = W / 2 + Math.sin(t * 1.8) * W * 0.38;
        const y = H * 0.4 + Math.sin(t * 3.1) * H * 0.12;
        g.fillStyle = '#080808';
        g.beginPath();
        g.ellipse(x, y, 5, 3.5, 0, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'flash': {
        const on = t % 1.2 < 0.25;
        g.fillStyle = on ? '#ffffff' : '#3a3a3a';
        g.fillRect(0, 0, W, H);
        break;
      }
    }
  }
}
