/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Statistics window: the whole session history streamed from the main window.
import { useEffect, useMemo, useRef, useState } from 'react';
import { INTENTS, REGIONS, SAMPLE_HZ, type LogEvent, type Sample, type StatsPayload, type Summary } from '../sim/history';
import { INTENT_LABEL } from '../sim/fly';
import { Logo } from '../ui/icons';

const RANGES = [{ label: '1 min', s: 60 }, { label: '5 min', s: 300 }, { label: '30 min', s: 1800 }];

const INTENT_COLOR: Record<string, string> = {
  still: 'rgba(255,255,255,0.14)',
  forward: '#ffffff',
  left: '#6aa8ff',
  right: '#b9d6ff',
  back: '#ffc46b',
  escape: '#ff5a52',
  court: '#c79bff',
};

const EVENT_LABEL: Record<string, string> = {
  session: 'Session', media: 'Media', intent: 'Intent', flight: 'Flight', stimulus: 'Stimulus', perturb: 'Perturbation', mode: 'Mode',
};

const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

function clock(t: number) {
  const s = Math.floor(t);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (v: number) => String(v).padStart(2, '0');
  return h ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

// Canvas that redraws whenever its size or inputs change
function useCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const cv = ref.current!;
    const paint = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      drawRef.current(g, w, h);
    };
    paint();
    const obs = new ResizeObserver(paint);
    obs.observe(cv);
    return () => obs.disconnect();
  }, deps);
  return ref;
}

function axis(g: CanvasRenderingContext2D, w: number, h: number, t0: number, t1: number) {
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1;
  g.font = '10.5px "Geist Mono Variable", monospace';
  g.fillStyle = 'rgba(255,255,255,0.4)';
  const span = Math.max(1, t1 - t0);
  const step = [5, 10, 15, 30, 60, 120, 300, 600].find((s) => span / s <= 8) ?? 600;
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    const x = Math.round(((t - t0) / span) * w) + 0.5;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h - 16); g.stroke();
    g.fillText(clock(t), Math.min(x + 3, w - 40), h - 4);
  }
}

function BehaviourChart({ samples, t0, t1 }: { samples: Sample[]; t0: number; t1: number }) {
  const ref = useCanvas((g, w, h) => {
    const plotH = h - 18;
    axis(g, w, h, t0, t1);
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * w;
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.moveTo(0, plotH / 2 + 0.5); g.lineTo(w, plotH / 2 + 0.5); g.stroke();
    const series: [string, (s: Sample) => number, boolean][] = [
      ['#6aa8ff', (s) => s.turn, true],
      ['#ffffff', (s) => Math.min(1, s.forward * 3), false],
      ['#ffc46b', (s) => Math.min(1, s.backward * 2), false],
      ['#ff5a52', (s) => s.escape, false],
    ];
    for (const [color, get, signed] of series) {
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.beginPath();
      let first = true;
      for (const s of samples) {
        if (s.t < t0) continue;
        const v = get(s);
        const y = signed ? plotH / 2 - v * (plotH / 2 - 2) : plotH - 2 - v * (plotH - 4);
        if (first) { g.moveTo(x(s.t), y); first = false; } else g.lineTo(x(s.t), y);
      }
      g.stroke();
    }
  }, [samples, t0, t1]);
  return <canvas className="chart" ref={ref} />;
}

function IntentStrip({ samples, t0, t1 }: { samples: Sample[]; t0: number; t1: number }) {
  const ref = useCanvas((g, w, h) => {
    const span = Math.max(1, t1 - t0);
    const bw = Math.max(1, w / (span * SAMPLE_HZ));
    for (const s of samples) {
      if (s.t < t0) continue;
      g.fillStyle = INTENT_COLOR[INTENTS[s.intent]];
      g.fillRect(((s.t - t0) / span) * w, 0, bw + 0.5, h);
    }
  }, [samples, t0, t1]);
  return <canvas className="strip" ref={ref} />;
}

function RegionHeatmap({ samples, t0, t1 }: { samples: Sample[]; t0: number; t1: number }) {
  const ref = useCanvas((g, w, h) => {
    const labelW = 128;
    const rowH = (h - 18) / REGIONS.length;
    axis(g, w - labelW, h, t0, t1);
    const span = Math.max(1, t1 - t0);
    const cols = Math.max(1, Math.floor(w - labelW));
    // Max activity per pixel column and region
    const grid = new Float32Array(cols * REGIONS.length);
    for (const s of samples) {
      if (s.t < t0) continue;
      const c = Math.min(cols - 1, Math.floor(((s.t - t0) / span) * cols));
      s.regions.forEach((v, r) => { grid[r * cols + c] = Math.max(grid[r * cols + c], v); });
    }
    let max = 0.05;
    for (const v of grid) max = Math.max(max, v);
    g.font = '11px "Geist Mono Variable", monospace';
    REGIONS.forEach((reg, r) => {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText(reg.name.toUpperCase(), w - labelW + 10, r * rowH + rowH / 2 + 4);
      for (let c = 0; c < cols; c++) {
        const v = grid[r * cols + c] / max;
        if (v <= 0.01) continue;
        g.fillStyle = `rgba(255,255,255,${Math.min(1, v) * 0.95})`;
        g.fillRect(c, r * rowH + 1, 1, rowH - 2);
      }
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.beginPath(); g.moveTo(0, (r + 1) * rowH + 0.5); g.lineTo(w, (r + 1) * rowH + 0.5); g.stroke();
    });
  }, [samples, t0, t1]);
  return <canvas className="chart tall" ref={ref} />;
}

function toCsv(samples: Sample[], events: LogEvent[]) {
  const head = ['time_s', 'escape', 'turn', 'forward', 'backward', 'intent', 'active_neurons', 'flying', 'step_ms', ...REGIONS.map((r) => r.name.toLowerCase().replace(/ /g, '_'))];
  const rows = samples.map((s) => [
    s.t.toFixed(2), s.escape.toFixed(4), s.turn.toFixed(4), s.forward.toFixed(4), s.backward.toFixed(4),
    INTENTS[s.intent], s.active, s.flying, s.stepMs.toFixed(2), ...s.regions.map((v) => v.toFixed(4)),
  ].join(','));
  const log = events.map((e) => [e.t.toFixed(2), e.kind, `"${e.text.replace(/"/g, '""')}"`].join(','));
  return [head.join(','), ...rows, '', 'time_s,event,text', ...log].join('\n');
}

export default function StatsApp() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [range, setRange] = useState(300);

  useEffect(() => {
    document.title = 'ExploreFly · Statistics';
    const off = window.fly.stats.onData<StatsPayload>((p) => {
      setSamples((prev) => (p.full ? p.samples : [...prev, ...p.samples]));
      setEvents((prev) => (p.full ? p.events : [...prev, ...p.events]));
      setSummary(p.summary);
    });
    window.fly.stats.request();
    return off;
  }, []);

  const t1 = summary?.elapsed ?? 0;
  const t0 = Math.max(0, t1 - range);
  const totalIntent = useMemo(() => (summary ? summary.intentTime.reduce((a, b) => a + b, 0) || 1 : 1), [summary]);
  const maxRegion = summary ? Math.max(0.01, ...summary.regionMean) : 1;
  const mean = (get: (s: Sample) => number) => (samples.length ? samples.reduce((a, s) => a + get(s), 0) / samples.length : 0);

  if (!summary) {
    return (
      <div className="loading">
        <div className="loading-inner"><Logo /><p>Waiting for the session</p></div>
      </div>
    );
  }

  const c = summary.counters;
  const kpis: [string, string][] = [
    ['Session', clock(summary.elapsed)],
    ['Media viewed', fmt(c.media)],
    ['Escapes', fmt(c.escapes)],
    ['Take-offs', fmt(c.takeoffs)],
    ['Walked · flown', `${fmt(c.walked, 1)} · ${fmt(c.flown, 1)}`],
    ['Active neurons', fmt(mean((s) => s.active))],
    ['Step time', `${fmt(mean((s) => s.stepMs), 1)} ms`],
    ['Events', fmt(events.length)],
  ];

  return (
    <div className="stats-app">
      <div className="bar">
        <span className="brand-mini"><Logo /> Statistics</span>
        <div className="grow" />
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r.s} className={range === r.s ? 'active' : ''} onClick={() => setRange(r.s)}>{r.label}</button>
          ))}
        </div>
        <button className="btn small" onClick={() => window.fly.saveFile(`explorefly-session-${new Date(summary.started).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`, toCsv(samples, events))}>Export CSV</button>
        <button className="btn small" onClick={() => window.fly.stats.command('clear')}>Clear history</button>
      </div>

      <div className="stats-scroll">
        <div className="kpis">
          {kpis.map(([k, v]) => (
            <div className="kpi" key={k}><span className="label">{k}</span><b>{v}</b></div>
          ))}
        </div>

        <div className="stats-row">
          <section className="cell wide">
            <div className="cell-head">
              <span className="label">Behaviour</span>
              <div className="end legend-inline">
                <span><i style={{ background: '#6aa8ff' }} />Turn (L/R)</span>
                <span><i style={{ background: '#ffffff' }} />Forward</span>
                <span><i style={{ background: '#ffc46b' }} />Backward</span>
                <span><i style={{ background: '#ff5a52' }} />Escape</span>
              </div>
            </div>
            <div className="chart-box">
              <BehaviourChart samples={samples} t0={t0} t1={t1} />
              <IntentStrip samples={samples} t0={t0} t1={t1} />
            </div>
          </section>
          <section className="cell">
            <div className="cell-head"><span className="label">Time per intent</span></div>
            <div className="bars">
              {INTENTS.map((k, i) => (
                <div className="bar-row" key={k}>
                  <span><i style={{ background: INTENT_COLOR[k] }} />{INTENT_LABEL[k]}</span>
                  <div className="bar-meter"><i style={{ width: (summary.intentTime[i] / totalIntent) * 100 + '%' }} /></div>
                  <span className="v">{fmt((summary.intentTime[i] / totalIntent) * 100)} %</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="stats-row">
          <section className="cell wide">
            <div className="cell-head"><span className="label">Activity by region</span><span className="end label">Max per {fmt(1 / SAMPLE_HZ, 2)} s</span></div>
            <div className="chart-box"><RegionHeatmap samples={samples} t0={t0} t1={t1} /></div>
          </section>
          <section className="cell">
            <div className="cell-head"><span className="label">Mean activity by region</span></div>
            <div className="bars">
              {REGIONS.map((r, i) => (
                <div className="bar-row" key={r.name}>
                  <span>{r.name}</span>
                  <div className="bar-meter"><i style={{ width: (summary.regionMean[i] / maxRegion) * 100 + '%' }} /></div>
                  <span className="v">{fmt(summary.regionMean[i] * 100, 1)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="stats-row three">
          <section className="cell">
            <div className="cell-head"><span className="label">Most active cell types</span><span className="end label">Mean · peak</span></div>
            <div className="table">
              {summary.topTypes.length === 0 && <div className="faint pad">Nothing recorded yet</div>}
              {summary.topTypes.map((t, i) => (
                <div className="tr" key={t.type + t.side}>
                  <span className="faint mono">{String(i + 1).padStart(2, '0')}</span>
                  <span>{t.type} <span className="faint">{t.side}</span></span>
                  <span className="faint">{t.group}</span>
                  <span className="mono">{fmt(t.mean * 100, 1)} · {fmt(t.peak * 100)}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="cell">
            <div className="cell-head"><span className="label">Event log</span><span className="end label">{fmt(events.length)}</span></div>
            <div className="table log">
              {[...events].reverse().slice(0, 400).map((e, i) => (
                <div className="tr" key={i}>
                  <span className="mono faint">{clock(e.t)}</span>
                  <span className="mono faint">{EVENT_LABEL[e.kind]}</span>
                  <span>{e.text}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="cell">
            <div className="cell-head"><span className="label">Media history</span><span className="end label">{fmt(summary.media.length)}</span></div>
            <div className="table">
              {summary.media.length === 0 && <div className="faint pad">No media opened yet</div>}
              {[...summary.media].reverse().map((m, i) => (
                <div className="tr" key={i}>
                  <span className="mono faint">{clock(m.start)}</span>
                  <span className="faint">{m.kind}</span>
                  <span>{m.name}</span>
                  <span className="mono">{clock((m.end ?? summary.elapsed) - m.start)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
