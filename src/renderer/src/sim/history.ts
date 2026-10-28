/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Session recorder: behaviour and regional activity sampled at 4 Hz, a log of events,
// and per cell type activity totals. The statistics window reads it over IPC.
import type { Connectome } from '../data/connectome';
import { INTENT_LABEL, type Behaviour, type Fly } from './fly';

export const SAMPLE_HZ = 4;
const MAX_SAMPLES = SAMPLE_HZ * 60 * 30;
const MAX_EVENTS = 2000;

export const INTENTS: Behaviour['intent'][] = ['still', 'forward', 'left', 'right', 'back', 'escape', 'court'];

export const REGIONS: { name: string; match: (sc: string) => boolean }[] = [
  { name: 'Optic lobe', match: (sc) => sc.startsWith('ol_') },
  { name: 'Visual projection', match: (sc) => sc.startsWith('visual_') },
  { name: 'Central brain', match: (sc) => sc === 'cb_intrinsic' || sc.includes('endocrine') },
  { name: 'Sensory', match: (sc) => sc.includes('sensory') },
  { name: 'Descending', match: (sc) => sc.startsWith('descending') },
  { name: 'Ascending', match: (sc) => sc.startsWith('ascending') },
  { name: 'VNC', match: (sc) => sc === 'vnc_intrinsic' },
  { name: 'Motor', match: (sc) => sc.includes('motor') },
];

export type EventKind = 'session' | 'media' | 'intent' | 'flight' | 'stimulus' | 'perturb' | 'mode';

export interface Sample {
  t: number;
  escape: number;
  turn: number;
  forward: number;
  backward: number;
  intent: number;
  active: number;
  regions: number[];
  flying: number;
  stepMs: number;
}

export interface LogEvent {
  t: number;
  kind: EventKind;
  text: string;
}

export interface MediaEntry {
  name: string;
  kind: string;
  start: number;
  end: number | null;
}

export interface TypeStat {
  type: string;
  side: string;
  group: string;
  mean: number;
  peak: number;
}

export interface Summary {
  started: number;
  elapsed: number;
  counters: { escapes: number; takeoffs: number; landings: number; walked: number; flown: number; media: number };
  intentTime: number[];
  regionMean: number[];
  topTypes: TypeStat[];
  media: MediaEntry[];
}

export interface StatsPayload {
  full: boolean;
  samples: Sample[];
  events: LogEvent[];
  summary: Summary;
}

export class History {
  samples: Sample[] = [];
  events: LogEvent[] = [];
  media: MediaEntry[] = [];
  readonly started = Date.now();
  counters = { escapes: 0, takeoffs: 0, landings: 0, walked: 0, flown: 0, media: 0 };
  intentTime = INTENTS.map(() => 0);
  private regionNodes: { idx: Int32Array; weight: Float32Array; total: number }[];
  private sum: Float64Array;
  private peak: Float32Array;
  private ticks = 0;
  private clock = 0;
  private sampleClock = 0;
  private lastIntent: Behaviour['intent'] = 'still';
  private sentSamples = 0;
  private sentEvents = 0;
  private c: Connectome;

  constructor(c: Connectome) {
    this.c = c;
    this.sum = new Float64Array(c.nodes.length);
    this.peak = new Float32Array(c.nodes.length);
    this.regionNodes = REGIONS.map((r) => {
      const idx: number[] = [], weight: number[] = [];
      c.nodes.forEach((n, i) => {
        if (r.match(n.sc)) { idx.push(i); weight.push(n.n); }
      });
      return { idx: Int32Array.from(idx), weight: Float32Array.from(weight), total: weight.reduce((a, b) => a + b, 0) || 1 };
    });
    this.log('session', 'Session started');
  }

  get now() {
    return this.clock;
  }

  log(kind: EventKind, text: string) {
    this.events.push({ t: this.clock, kind, text });
    if (this.events.length > MAX_EVENTS) {
      this.events.shift();
      this.sentEvents = Math.max(0, this.sentEvents - 1);
    }
  }

  openMedia(name: string, kind: string) {
    const last = this.media[this.media.length - 1];
    if (last && last.end === null) last.end = this.clock;
    if (name) {
      this.media.push({ name, kind, start: this.clock, end: null });
      this.counters.media++;
      this.log('media', `Opened ${kind.toLowerCase()} · ${name}`);
    }
  }

  // Called by the engine after every simulation step
  record(dt: number, fly: Fly, flying: boolean, moved: number, stepMs: number) {
    this.clock += dt;
    const b = fly.behaviour;
    const rate = fly.brain.rate;
    this.intentTime[INTENTS.indexOf(b.intent)] += dt;
    if (flying) this.counters.flown += moved;
    else this.counters.walked += moved;

    if (b.intent !== this.lastIntent) {
      if (b.intent === 'escape') this.counters.escapes++;
      this.log('intent', INTENT_LABEL[b.intent]);
      this.lastIntent = b.intent;
    }

    this.ticks++;
    for (let i = 0; i < rate.length; i++) {
      const r = rate[i];
      if (r < 1e-3) continue;
      this.sum[i] += r;
      if (r > this.peak[i]) this.peak[i] = r;
    }

    this.sampleClock += dt;
    if (this.sampleClock < 1 / SAMPLE_HZ) return;
    this.sampleClock = 0;
    let active = 0;
    for (let i = 0; i < rate.length; i++) if (rate[i] > 0.05) active += this.c.nodes[i].n;
    this.samples.push({
      t: this.clock,
      escape: b.escape,
      turn: b.turn,
      forward: b.forward,
      backward: b.backward,
      intent: INTENTS.indexOf(b.intent),
      active,
      regions: this.regionNodes.map(({ idx, weight, total }) => {
        let s = 0;
        for (let k = 0; k < idx.length; k++) s += rate[idx[k]] * weight[k];
        return s / total;
      }),
      flying: flying ? 1 : 0,
      stepMs,
    });
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
      this.sentSamples = Math.max(0, this.sentSamples - 1);
    }
  }

  takeoff(escape: boolean) {
    this.counters.takeoffs++;
    this.log('flight', escape ? 'Escape take-off' : 'Take-off');
  }

  landing() {
    this.counters.landings++;
    this.log('flight', 'Landed');
  }

  summary(): Summary {
    const n = this.c.nodes;
    const ticks = Math.max(1, this.ticks);
    const order: number[] = [];
    for (let i = 0; i < n.length; i++) if (this.sum[i] > 0 && !n[i].u) order.push(i);
    order.sort((a, b) => this.sum[b] - this.sum[a]);
    const regionMean = REGIONS.map((_, k) => {
      if (!this.samples.length) return 0;
      let s = 0;
      for (const x of this.samples) s += x.regions[k];
      return s / this.samples.length;
    });
    return {
      started: this.started,
      elapsed: this.clock,
      counters: { ...this.counters },
      intentTime: [...this.intentTime],
      regionMean,
      topTypes: order.slice(0, 25).map((i) => ({
        type: n[i].t,
        side: n[i].s,
        group: REGIONS.find((r) => r.match(n[i].sc))?.name ?? n[i].sc,
        mean: this.sum[i] / ticks,
        peak: this.peak[i],
      })),
      media: this.media.map((m) => ({ ...m })),
    };
  }

  // Everything new since the last call, or the whole history when full is true
  payload(full: boolean): StatsPayload {
    const samples = full ? this.samples : this.samples.slice(this.sentSamples);
    const events = full ? this.events : this.events.slice(this.sentEvents);
    this.sentSamples = this.samples.length;
    this.sentEvents = this.events.length;
    return { full, samples, events, summary: this.summary() };
  }

  clear() {
    this.samples = [];
    this.events = [];
    this.media = this.media.filter((m) => m.end === null).map((m) => ({ ...m, start: this.clock }));
    this.counters = { escapes: 0, takeoffs: 0, landings: 0, walked: 0, flown: 0, media: this.media.length };
    this.intentTime = INTENTS.map(() => 0);
    this.sum.fill(0);
    this.peak.fill(0);
    this.ticks = 0;
    this.sentSamples = 0;
    this.sentEvents = 0;
    this.log('session', 'History cleared');
  }
}
