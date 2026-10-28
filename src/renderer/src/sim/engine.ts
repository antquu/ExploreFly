/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Shared 30 Hz loop: frame -> compound eye -> connectome -> behaviour -> listeners.
// Live and Explore plug their own frame provider in when they become visible.
import type { Connectome } from '../data/connectome';
import { Fly } from './fly';
import { CompoundEye, type FrameSource, type VisionOutput } from './vision';
import { History } from './history';

export type ViewMode = 'viewer' | 'walker';
export type FrameProvider = (dt: number) => FrameSource | null;

export interface Agent {
  x: number;
  y: number;
  heading: number;
  state: 'walk' | 'fly';
  alt: number;
  wing: number;
  legs: number;
  flightLeft: number;
  nextSaccade: number;
  saccadeLeft: number;
  turnRate: number;
  trail: [number, number, number][];
}

const HZ = 30;

export class Engine {
  readonly fly: Fly;
  readonly eye = new CompoundEye();
  readonly history: History;
  vision: VisionOutput | null = null;
  mode: ViewMode = 'viewer';
  paused = false;
  agent: Agent = {
    x: 0.5, y: 0.6, heading: 0, state: 'walk', alt: 0, wing: 0, legs: 0,
    flightLeft: 0, nextSaccade: 0, saccadeLeft: 0, turnRate: 0, trail: [],
  };
  // Take-off animation of the fly glyph in front of the screen, 0 when idle
  hop = 0;
  gaze = { x: 0, y: 0 };
  fps = 0;
  stepMs = 0;
  private provider: FrameProvider | null = null;
  private listeners = new Set<() => void>();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private saccade = { x: 0, y: 0, next: 1 };
  private trailClock = 0;
  private frames = 0;
  private fpsClock = 0;
  private lastFrameSize: [number, number] = [1, 1];

  constructor(c: Connectome) {
    this.fly = new Fly(c);
    this.history = new History(c);
  }

  setProvider(p: FrameProvider | null) {
    this.provider = p;
    this.eye.reset();
  }

  setMode(mode: ViewMode) {
    if (mode !== this.mode) this.history.log('mode', mode === 'walker' ? 'Fly placed on the page' : 'Fly facing the screen');
    this.mode = mode;
    this.eye.reset();
    this.agent.trail = [];
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const elapsed = Math.min(0.25, (now - this.last) / 1000);
      this.last = now;
      if (this.paused) return;
      this.acc += elapsed;
      if (this.acc < 1 / HZ) return;
      const dt = Math.min(this.acc, 0.1);
      this.acc = 0;
      const t0 = performance.now();
      this.tick(dt);
      this.stepMs += (performance.now() - t0 - this.stepMs) * 0.1;
      this.frames++;
      this.fpsClock += dt;
      if (this.fpsClock >= 1) {
        this.fps = this.frames / this.fpsClock;
        this.frames = 0;
        this.fpsClock = 0;
      }
      for (const fn of this.listeners) fn();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  private tick(dt: number) {
    const frame = this.provider?.(dt) ?? null;
    if (frame) {
      this.lastFrameSize = [frame.width, frame.height];
      const sampler = this.mode === 'viewer' ? this.viewerSampler(frame, dt) : this.walkerSampler(frame);
      this.vision = this.eye.process(frame, sampler, dt);
    } else {
      this.vision = null;
    }
    this.fly.feed(this.vision, dt);
    const a = this.agent;
    const x0 = a.x, y0 = a.y;
    if (this.mode === 'walker') this.moveAgent(dt);
    else this.moveGaze(dt);
    const moved = this.mode === 'walker' ? Math.hypot(a.x - x0, a.y - y0) : 0;
    this.history.record(dt, this.fly, this.mode === 'walker' && a.state === 'fly', moved, this.stepMs);
  }

  // Body saccades: flies turn in quick jumps every second or two, which also
  // refreshes the image on the retina when the scene is static
  private viewerSampler(frame: FrameSource, dt: number) {
    const s = this.saccade;
    s.next -= dt;
    if (s.next <= 0) {
      s.x = (Math.random() - 0.5) * frame.width * 0.035;
      s.y = (Math.random() - 0.5) * frame.height * 0.02;
      s.next = 1 + Math.random() * 1.5;
    }
    return CompoundEye.screen(frame.width, frame.height, s.x, s.y);
  }

  private walkerSampler(frame: FrameSource) {
    const a = this.agent;
    const radius = Math.min(frame.width, frame.height) * 0.22 * (1 + a.alt * 0.8);
    return CompoundEye.walker(a.x * frame.width, a.y * frame.height, a.heading, radius);
  }

  private moveGaze(dt: number) {
    const v = this.vision;
    const b = this.fly.behaviour;
    const g = this.gaze;
    let tx = g.x + b.turn * 0.9, ty = g.y * 0.9;
    if (v) {
      const eye = v.left.target > v.right.target ? v.left : v.right;
      if (eye.target > 0.25) {
        tx = eye.targetX;
        ty = eye.targetY;
      } else if (v.barX !== 0) {
        tx = tx * 0.6 + v.barX * 0.4;
      }
    }
    if (b.intent === 'escape') {
      ty = -1;
      if (this.hop === 0) this.hop = 0.001;
    }
    if (this.hop > 0) this.hop = this.hop + dt / 1.8 >= 1 ? 0 : this.hop + dt / 1.8;
    const k = Math.min(1, dt * 2.2);
    g.x += (Math.max(-1, Math.min(1, tx)) - g.x) * k;
    g.y += (Math.max(-1, Math.min(1, ty)) - g.y) * k;
  }

  // Asks the walking fly to take off
  requestTakeoff() {
    if (this.agent.state === 'walk') this.takeOff(false);
  }

  private takeOff(escape: boolean) {
    const a = this.agent;
    const v = this.vision;
    a.state = 'fly';
    this.history.takeoff(escape);
    a.flightLeft = escape ? 1.6 + Math.random() : 2 + Math.random() * 3;
    a.nextSaccade = 0.3;
    if (escape && v) a.heading += (v.left.loom > v.right.loom ? 1 : -1) * (Math.PI / 2);
  }

  private moveAgent(dt: number) {
    const a = this.agent;
    const b = this.fly.behaviour;
    const v = this.vision;
    const aspect = this.lastFrameSize[0] / this.lastFrameSize[1];
    let speed: number;

    if (a.state === 'walk') {
      if (b.escape > 0.4) this.takeOff(true);
      else if (Math.random() < dt * 0.05) this.takeOff(false);
    }

    if (a.state === 'fly') {
      a.flightLeft -= dt;
      a.alt = a.flightLeft > 0.35 ? a.alt + (1 - a.alt) * Math.min(1, dt * 7) : Math.max(0, a.alt - dt / 0.35);
      a.wing += dt * Math.PI * 2 * 9;
      // Flight saccades: straight segments broken by fast turns, away from looming
      // and from the edges, biased by the steering neurons
      a.nextSaccade -= dt;
      if (a.nextSaccade <= 0) {
        let dir = Math.random() < 0.5 ? -1 : 1;
        const fx = a.x + Math.sin(a.heading) * 0.15, fy = a.y - Math.cos(a.heading) * 0.15 * aspect;
        if (fx < 0.08 || fx > 0.92 || fy < 0.08 || fy > 0.92) {
          const toCenter = Math.atan2(0.5 - a.x, -(0.5 - a.y)) - a.heading;
          dir = Math.sin(toCenter) >= 0 ? 1 : -1;
        } else if (v && Math.abs(v.left.loom - v.right.loom) > 0.05) {
          dir = v.left.loom > v.right.loom ? 1 : -1;
        } else if (Math.abs(b.turn) > 0.1) {
          dir = Math.sign(b.turn);
        }
        a.saccadeLeft = 0.1;
        a.turnRate = (dir * (0.7 + Math.random() * 0.9)) / 0.1;
        a.nextSaccade = 0.35 + Math.random() * 0.8;
      }
      if (a.saccadeLeft > 0) {
        a.heading += a.turnRate * Math.min(dt, a.saccadeLeft);
        a.saccadeLeft -= dt;
      }
      a.heading += b.turn * 0.8 * dt;
      speed = 0.06 + 0.3 * a.alt;
      if (a.flightLeft <= 0 && a.alt <= 0) {
        a.state = 'walk';
        this.history.landing();
      }
    } else {
      // Stripe fixation: flies orient towards strong vertical contrast
      const fixation = v ? v.barX * 0.9 : 0;
      const wander = (Math.random() - 0.5) * 2.2;
      a.heading += (b.turn * 2.6 + fixation + wander) * dt;
      speed = Math.max(-0.05, 0.035 + b.forward * 0.15 - b.backward * 0.2);
      a.legs += dt * 14 * (0.4 + Math.abs(speed) * 12);
      a.alt = 0;
    }

    a.x += Math.sin(a.heading) * speed * dt;
    a.y -= Math.cos(a.heading) * speed * dt * aspect;

    // Bounce off the edges of the media
    if (a.x < 0.03 || a.x > 0.97) {
      a.heading = -a.heading;
      a.x = Math.max(0.03, Math.min(0.97, a.x));
    }
    if (a.y < 0.03 || a.y > 0.97) {
      a.heading = Math.PI - a.heading;
      a.y = Math.max(0.03, Math.min(0.97, a.y));
    }

    this.trailClock += dt;
    if (this.trailClock > 0.08) {
      this.trailClock = 0;
      a.trail.push([a.x, a.y, a.alt]);
      if (a.trail.length > 90) a.trail.shift();
    }
  }
}
