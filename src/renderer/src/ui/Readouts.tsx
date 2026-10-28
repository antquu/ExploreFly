/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Behaviour read from descending neurons, the fly's view, and the most active cell types.
import { useEffect, useRef } from 'react';
import { superLabel, SIDE_LABEL } from '../data/connectome';
import { INTENT_LABEL } from '../sim/fly';
import { COLS, ROWS } from '../sim/vision';
import { useApp, useEngineTick } from '../state';

const INTENT_HINT: Record<string, string> = {
  escape: 'Giant Fiber (DNp01)',
  back: 'Moonwalker (MDN)',
  left: 'Left DNa02 and HS cells',
  right: 'Right DNa02 and HS cells',
  forward: 'P9 (DNp09)',
  still: 'No strong motor command',
  court: 'fru+ descending neurons',
};

const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100);

// Square heading dial: the needle leans with the steering command
export function Compass({ turn, escape }: { turn: number; escape: number }) {
  const angle = turn * 70;
  const hot = escape > 0.35;
  return (
    <svg className="compass" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="0.5" y="0.5" width="63" height="63" fill="none" stroke="var(--line-2)" />
      {[-60, -30, 0, 30, 60].map((a) => (
        <line key={a} x1="32" y1="5" x2="32" y2={a === 0 ? 11 : 8} stroke="var(--fg-3)" transform={`rotate(${a} 32 32)`} />
      ))}
      <g transform={`rotate(${angle} 32 32)`} style={{ transition: 'transform 0.2s' }}>
        <line x1="32" y1="32" x2="32" y2="12" stroke={hot ? 'var(--red)' : 'var(--fg)'} strokeWidth="2" />
        <rect x="29" y="9" width="6" height="6" fill={hot ? 'var(--red)' : 'var(--fg)'} />
      </g>
      <rect x="29.5" y="29.5" width="5" height="5" fill="var(--bg)" stroke="var(--fg)" />
    </svg>
  );
}

export function BehaviourCard() {
  useEngineTick(10);
  const { engine } = useApp();
  const b = engine.fly.behaviour;
  return (
    <div className="cell">
      <div className="cell-head"><span className="label">Intent</span></div>
      <div className="readout">
        <div className="intent">
          <Compass turn={b.turn} escape={b.escape} />
          <div>
            <h3>{INTENT_LABEL[b.intent]}</h3>
            <p>{INTENT_HINT[b.intent]}</p>
          </div>
        </div>
        <div className="meters">
          <span>Escape</span><div className="bar-meter red"><i style={{ width: pct(b.escape) + '%' }} /></div><span className="v">{pct(b.escape)}</span>
          <span>Turn</span><div className="bar-meter"><i style={{ width: pct(Math.abs(b.turn)) + '%' }} /></div><span className="v">{b.turn < -0.02 ? 'L' : b.turn > 0.02 ? 'R' : '·'}</span>
          <span>Forward</span><div className="bar-meter"><i style={{ width: pct(b.forward * 3) + '%' }} /></div><span className="v">{pct(b.forward * 3)}</span>
          <span>Backward</span><div className="bar-meter"><i style={{ width: pct(b.backward * 2) + '%' }} /></div><span className="v">{pct(b.backward * 2)}</span>
        </div>
      </div>
    </div>
  );
}

// Ommatidia on a square lattice, in fly false colours (UV as violet, green as green)
export function FlyEyeCard() {
  const { engine } = useApp();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current!;
    const g = cv.getContext('2d')!;
    const draw = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== w * 2) { cv.width = w * 2; cv.height = h * 2; }
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.clearRect(0, 0, w, h);
      const eye = engine.eye;
      const has = engine.vision !== null;
      const gap = 10;
      const size = Math.min((w - gap) / 2 / COLS, h / ROWS);
      const ew = size * COLS;
      const x0 = (w - ew * 2 - gap) / 2, y0 = (h - size * ROWS) / 2;
      for (let e = 0; e < 2; e++) {
        const ox = x0 + e * (ew + gap);
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const i = row * COLS * 2 + e * COLS + col;
            const l = has ? eye.lum[i] : 0.04;
            const uv = has ? eye.uv[i] : 0;
            const gr = has ? eye.green[i] : 0;
            g.fillStyle = `rgb(${Math.round(uv * 150 + l * 60)},${Math.round(gr * 200 + l * 40)},${Math.round(uv * 255)})`;
            g.fillRect(ox + col * size + 0.5, y0 + row * size + 0.5, size - 1, size - 1);
          }
        }
      }
    };
    draw();
    return engine.subscribe(draw);
  }, [engine]);

  return (
    <div className="cell">
      <div className="cell-head"><span className="label">Fly's view</span><span className="end label">{COLS * ROWS * 2} ommatidia</span></div>
      <div className="readout">
        <canvas className="eye-canvas" ref={canvas} />
        <div className="eye-legend"><span>Left eye</span><span>UV · green · lum.</span><span>Right eye</span></div>
      </div>
    </div>
  );
}

export function ActiveList({ count = 7 }: { count?: number }) {
  useEngineTick(5);
  const { engine, c } = useApp();
  const brain = engine.fly.brain;
  const top = brain.top(count, (i) => !c.nodes[i].u);
  return (
    <div className="active-list">
      <div className="label" style={{ marginBottom: 6 }}>Most active</div>
      {top.length === 0 && <div className="faint" style={{ fontSize: 12 }}>Network at rest</div>}
      {top.map((i) => {
        const n = c.nodes[i];
        return (
          <div className="active-row" key={i}>
            <div className="n">{n.t} <span>{SIDE_LABEL[n.s]?.[0]?.toUpperCase() ?? ''} · {superLabel(n.sc)}</span></div>
            <div className="bar-meter"><i style={{ width: pct(brain.rate[i]) + '%' }} /></div>
          </div>
        );
      })}
    </div>
  );
}
