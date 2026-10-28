/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Wires the eye and the other senses into the connectome and reads behaviour
// back from descending neurons whose role is established in the literature.
import { select, type Connectome, type Side } from '../data/connectome';
import { Brain } from './brain';
import type { VisionOutput } from './vision';

type Group = { L: number[]; R: number[] };

function pair(c: Connectome, patterns: (string | RegExp)[]): Group {
  return { L: select(c, patterns, 'L'), R: select(c, patterns, 'R') };
}

export interface Behaviour {
  turn: number;
  forward: number;
  backward: number;
  escape: number;
  courtship: number;
  intent: 'escape' | 'back' | 'left' | 'right' | 'forward' | 'still' | 'court';
}

export type ChemicalStimulus = 'vinegar' | 'cva' | 'co2' | 'sugar' | 'touch';

export class Fly {
  readonly brain: Brain;
  readonly c: Connectome;
  readonly g;
  readonly chemical: Partial<Record<ChemicalStimulus, number[]>>;
  private chem = new Map<ChemicalStimulus, number>();
  behaviour: Behaviour = { turn: 0, forward: 0, backward: 0, escape: 0, courtship: 0, intent: 'still' };

  constructor(c: Connectome) {
    this.c = c;
    this.brain = new Brain(c);
    this.g = {
      r16: pair(c, ['R1-R6']),
      r7: pair(c, [/^R7/]),
      r8: pair(c, [/^R8/]),
      ftb: pair(c, ['T4a', 'T5a']),
      btf: pair(c, ['T4b', 'T5b']),
      up: pair(c, ['T4c', 'T5c']),
      down: pair(c, ['T4d', 'T5d']),
      loom: pair(c, ['LC4', 'LPLC2']),
      target: pair(c, ['LC11', 'LC10a', 'LC10b', 'LC10c', 'LC10d', 'LC10e']),
      hs: pair(c, ['HSE', 'HSN', 'HSS']),
      steer: pair(c, ['DNa02', 'DNa01']),
      giant: pair(c, ['DNp01', 'DNp02', 'DNp11', 'DNp04']),
      mdn: pair(c, ['MDN']),
      walk: pair(c, ['DNp09', 'DNg97', 'DNg100']),
      court: pair(c, ['DNp13', 'pIP10', 'DNa12']),
    };
    const orn = (glom: string[]) => select(c, glom.map((g) => `ORN_${g}`));
    this.chemical = {
      vinegar: orn(['DM1', 'DM2', 'DM4', 'DP1m', 'VM2', 'VM7d', 'DM3']),
      cva: orn(['DA1', 'VA1v']),
      co2: orn(['V']),
      sugar: c.nodes.flatMap((n, i) => (/^LB|^PhG/.test(n.t) ? [i] : [])),
      touch: c.nodes.flatMap((n, i) => (n.c === 'mechanosensory_tactile' ? [i] : [])),
    };
  }

  setChemical(kind: ChemicalStimulus, level: number) {
    if (level > 0) this.chem.set(kind, level);
    else this.chem.delete(kind);
  }

  get activeChemicals() {
    return [...this.chem.keys()];
  }

  private add(list: number[], v: number) {
    const input = this.brain.input;
    for (const i of list) input[i] += v;
  }

  private addEye(group: Group, side: Side, v: number) {
    this.add(side === 'L' ? group.L : group.R, v);
  }

  // Converts eye features into input currents and runs the network for dt seconds
  feed(vision: VisionOutput | null, dt: number) {
    this.brain.input.fill(0);
    if (vision) {
      for (const [side, eye] of [['L', vision.left], ['R', vision.right]] as const) {
        this.addEye(this.g.r16, side, 0.25 + eye.lum * 0.9 + eye.on * 6);
        this.addEye(this.g.r7, side, eye.uv * 0.9);
        this.addEye(this.g.r8, side, eye.green * 0.9);
        this.addEye(this.g.ftb, side, Math.min(1.5, eye.ftb * 1.2));
        this.addEye(this.g.btf, side, Math.min(1.5, eye.btf * 1.2));
        this.addEye(this.g.up, side, Math.min(1.5, eye.up * 1.2));
        this.addEye(this.g.down, side, Math.min(1.5, eye.down * 1.2));
        this.addEye(this.g.loom, side, Math.min(2, eye.loom * 1.6));
        this.addEye(this.g.target, side, Math.min(1.5, eye.target));
      }
    }
    for (const [kind, level] of this.chem) this.add(this.chemical[kind] ?? [], level);
    this.brain.step(dt);
    this.read(dt);
  }

  private read(dt: number) {
    const m = (l: number[]) => this.brain.mean(l);
    const g = this.g;
    // Turning: ipsilateral steering DNs plus the optomotor drive of HS cells
    const turn = (m(g.steer.R) - m(g.steer.L)) * 3 + (m(g.hs.R) - m(g.hs.L)) * 2.5;
    const escape = Math.max(m(g.giant.L), m(g.giant.R));
    const backward = (m(g.mdn.L) + m(g.mdn.R)) / 2;
    const forward = (m(g.walk.L) + m(g.walk.R)) / 2;
    const courtship = (m(g.court.L) + m(g.court.R)) / 2;
    const b = this.behaviour;
    const k = Math.min(1, dt / 0.25);
    b.turn += (Math.max(-1, Math.min(1, turn)) - b.turn) * k;
    b.escape += (escape - b.escape) * k;
    b.backward += (backward - b.backward) * k;
    b.forward += (forward - b.forward) * k;
    b.courtship += (courtship - b.courtship) * k;
    b.intent =
      b.escape > 0.35 ? 'escape'
        : b.backward > 0.3 && b.backward > b.forward ? 'back'
          : b.courtship > 0.35 ? 'court'
            : b.turn < -0.18 ? 'left'
              : b.turn > 0.18 ? 'right'
                : b.forward > 0.12 ? 'forward' : 'still';
  }
}

export const INTENT_LABEL: Record<Behaviour['intent'], string> = {
  escape: 'Emergency take-off',
  back: 'Backing up',
  left: 'Turning left',
  right: 'Turning right',
  forward: 'Walking forward',
  still: 'Watching',
  court: 'Courtship',
};
