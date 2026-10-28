/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Live tab: any media on the left, the connectome reacting to it on the right.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Media } from '../../../preload';
import BrainView from '../ui/BrainView';
import { ActiveList, BehaviourCard, FlyEyeCard } from '../ui/Readouts';
import { IconBack, IconClose, IconFile, IconForward, IconGlobe, IconMore, IconReload, IconSearch } from '../ui/icons';
import { drawFly, drawReticle } from '../ui/flyGlyph';
import { useApp, useEngineTick } from '../state';
import { StimulusPlayer, STIMULUS_LABEL, type VisualStimulus } from '../sim/stimuli';
import type { FrameSource } from '../sim/vision';
import type { Engine } from '../sim/engine';

type Shown = Media | { kind: 'demo'; name: string; url: string; stimulus: VisualStimulus };

const FRAME_W = 256;
const DEMOS: VisualStimulus[] = ['loomL', 'gratingR', 'target'];
const SITES = ['googlant.vercel.app', 'en.wikipedia.org', 'www.youtube.com'];
const SEARCH = 'https://googlant.vercel.app/search?q=';
const KIND_LABEL = { page: 'Web page', image: 'Image', video: 'Video', demo: 'Stimulus' };

function toUrl(text: string): string {
  const t = text.trim();
  if (/^(https?|file):\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return 'https://' + t;
  return SEARCH + encodeURIComponent(t);
}

// Draws an element into a small canvas with the same letterboxing as object-fit: contain
function grabElement(el: HTMLImageElement | HTMLVideoElement, stage: HTMLElement, cv: HTMLCanvasElement): FrameSource | null {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const iw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
  const ih = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
  if (!sw || !sh || !iw || !ih) return null;
  const w = FRAME_W, h = Math.max(16, Math.round((FRAME_W * sh) / sw));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#050505';
  g.fillRect(0, 0, w, h);
  const s = Math.min(w / iw, h / ih);
  g.drawImage(el, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
  return { width: w, height: h, data: g.getImageData(0, 0, w, h).data };
}

// Perspective tunnel of hairline squares behind the empty state
function Tunnel() {
  const vx = 640, vy = 250;
  const frames = Array.from({ length: 8 }, (_, i) => {
    const k = 1 - Math.pow(i / 7, 0.75) * 0.82;
    return { x: vx * (1 - k), y: vy * (1 - k), w: 1000 * k, h: 640 * k };
  });
  const last = frames[frames.length - 1];
  const rays = [[0, 0, last.x, last.y], [1000, 0, last.x + last.w, last.y], [0, 640, last.x, last.y + last.h], [1000, 640, last.x + last.w, last.y + last.h]];
  return (
    <svg className="tunnel" viewBox="0 0 1000 640" preserveAspectRatio="none" aria-hidden="true">
      {frames.slice(1).map((f, i) => (
        <rect key={i} x={f.x} y={f.y} width={f.w} height={f.h} fill="none" stroke="rgba(255,255,255,0.12)" vectorEffect="non-scaling-stroke" />
      ))}
      {rays.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.12)" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function useOverlay(engine: Engine, overlay: React.RefObject<HTMLCanvasElement | null>, visible: boolean) {
  useEffect(() => {
    if (!visible) return;
    const draw = () => {
      const cv = overlay.current;
      if (!cv) return;
      const w = cv.clientWidth, h = cv.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio);
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const b = engine.fly.behaviour;
      const t = performance.now() / 1000;
      const danger = b.intent === 'escape';

      if (danger) {
        g.strokeStyle = `rgba(255, 90, 82, ${0.5 + 0.3 * Math.sin(t * 14)})`;
        g.lineWidth = 2;
        g.strokeRect(1, 1, w - 2, h - 2);
      }

      if (engine.mode === 'viewer') {
        const gx = (engine.gaze.x * 0.5 + 0.5) * w;
        const gy = (engine.gaze.y * 0.5 + 0.5) * h;
        const lift = Math.sin(engine.hop * Math.PI);
        const fx = w / 2, fy = h - 34 - lift * h * 0.35;
        g.setLineDash([3, 5]);
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(fx, fy - 12); g.lineTo(gx, gy); g.stroke();
        g.setLineDash([]);
        drawReticle(g, gx, gy, 16, danger ? '#ff5a52' : '#ffffff');
        g.font = '500 11px "Geist Mono Variable", monospace';
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillText('TARGET', gx + 22, gy + 4);
        drawFly(g, { x: fx, y: fy, heading: Math.atan2(gx - fx, fy - gy), size: 46, alt: lift, wing: t * 50, legs: 0, danger });
      } else {
        const a = engine.agent;
        for (let i = 1; i < a.trail.length; i++) {
          const [x0, y0, z0] = a.trail[i - 1], [x1, y1] = a.trail[i];
          g.strokeStyle = `rgba(255,255,255,${(i / a.trail.length) * 0.5})`;
          g.lineWidth = 1;
          g.setLineDash(z0 > 0.05 ? [2, 4] : []);
          g.beginPath(); g.moveTo(x0 * w, y0 * h); g.lineTo(x1 * w, y1 * h); g.stroke();
        }
        g.setLineDash([]);
        drawFly(g, { x: a.x * w, y: a.y * h, heading: a.heading, size: 46, alt: a.alt, wing: a.wing, legs: a.legs, danger });
      }
    };
    return engine.subscribe(draw);
  }, [engine, overlay, visible]);
}

export default function LiveView({ active }: { active: boolean }) {
  const { engine } = useApp();
  useEngineTick(4);
  const [shown, setShown] = useState<Shown | null>(null);
  const [address, setAddress] = useState('');
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState(engine.mode);
  const [nav, setNav] = useState({ back: false, forward: false });
  const stage = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const webview = useRef<HTMLElement & Record<string, any>>(null);
  const media = useRef<HTMLImageElement & HTMLVideoElement>(null);
  const demoHost = useRef<HTMLDivElement>(null);
  const player = useRef<StimulusPlayer | null>(null);
  const grab = useRef(document.createElement('canvas'));
  const capture = useRef({ id: 0, busy: false, last: 0, frame: null as FrameSource | null });

  useOverlay(engine, overlay, active);

  const open = useCallback((m: Shown | null) => {
    capture.current = { id: 0, busy: false, last: 0, frame: null };
    engine.fly.brain.reset();
    engine.agent.trail = [];
    engine.history.openMedia(m?.name ?? '', m ? KIND_LABEL[m.kind] : '');
    setShown(m);
    setAddress(m && m.kind === 'page' && !m.url.startsWith('file:') ? m.url : '');
  }, [engine]);

  const go = (text: string) => {
    if (!text.trim()) return;
    const url = toUrl(text);
    if (shown?.kind === 'page' && webview.current && capture.current.id) webview.current.loadURL(url);
    else open({ kind: 'page', name: new URL(url).hostname, url });
  };

  const pickFile = async () => {
    const m = await window.fly.pickFile();
    if (m) open(m);
  };

  const demo = (s: VisualStimulus) => open({ kind: 'demo', name: STIMULUS_LABEL[s], url: '', stimulus: s });

  // Frame provider used by the engine while this tab is visible
  const provider = useCallback((dt: number): FrameSource | null => {
    if (!shown) return null;
    if (shown.kind === 'demo') return player.current ? player.current.frame(dt) : null;
    if (shown.kind === 'image' || shown.kind === 'video') {
      return media.current && stage.current ? grabElement(media.current, stage.current, grab.current) : null;
    }
    const cap = capture.current;
    const now = performance.now();
    if (cap.id && !cap.busy && now - cap.last > 110) {
      cap.busy = true;
      cap.last = now;
      window.fly.capture(cap.id, FRAME_W)
        .then((f) => { if (f && cap === capture.current) cap.frame = { width: f.width, height: f.height, data: f.data, bgra: true }; })
        .catch(() => undefined)
        .finally(() => { cap.busy = false; });
    }
    return cap.frame;
  }, [shown]);

  useEffect(() => {
    if (active) engine.setProvider(provider);
  }, [active, provider, engine]);

  // Demo stimuli render into a canvas shown in place of the media
  useEffect(() => {
    if (shown?.kind !== 'demo') return;
    const p = new StimulusPlayer();
    p.play(shown.stimulus);
    player.current = p;
    demoHost.current?.appendChild(p.canvas);
    return () => {
      p.canvas.remove();
      player.current = null;
    };
  }, [shown]);

  // Web view events: id for captures, address bar and history buttons
  useEffect(() => {
    const wv = webview.current;
    if (!wv || shown?.kind !== 'page') return;
    const ready = () => {
      capture.current.id = wv.getWebContentsId();
      setNav({ back: wv.canGoBack(), forward: wv.canGoForward() });
    };
    const moved = (e: Event & { url?: string }) => {
      if (e.url && !e.url.startsWith('file:')) setAddress(e.url);
      setNav({ back: wv.canGoBack(), forward: wv.canGoForward() });
    };
    wv.addEventListener('dom-ready', ready);
    wv.addEventListener('did-navigate', moved);
    wv.addEventListener('did-navigate-in-page', moved);
    return () => {
      wv.removeEventListener('dom-ready', ready);
      wv.removeEventListener('did-navigate', moved);
      wv.removeEventListener('did-navigate-in-page', moved);
    };
  }, [shown]);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) return open(await window.fly.describeFile(file));
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (text) go(text);
  };

  const switchMode = (m: typeof mode) => {
    engine.setMode(m);
    setMode(m);
  };

  const silenced = engine.fly.brain.silenced.reduce((s, v) => s + v, 0);
  const flying = mode === 'walker' && engine.agent.state === 'fly';

  return (
    <>
      <div className="bar">
        {shown?.kind === 'page' && (
          <>
            <button className="icon-btn" title="Back" disabled={!nav.back} onClick={() => webview.current?.goBack()}><IconBack /></button>
            <button className="icon-btn" title="Forward" disabled={!nav.forward} onClick={() => webview.current?.goForward()}><IconForward /></button>
            <button className="icon-btn" title="Reload" onClick={() => webview.current?.reload()}><IconReload /></button>
          </>
        )}
        <form className="field" style={{ width: 'min(560px, 48vw)' }} onSubmit={(e) => { e.preventDefault(); go(address); }}>
          <IconSearch />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address or search" spellCheck={false} />
          <span className="kbd">↵</span>
        </form>
        <button className="btn" onClick={pickFile}><IconFile /> Open</button>
        <div className="grow" />
      </div>

      <div className="cells live-grid">
        <section
          className="cell media"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="cell-head">
            <span className="label">Media</span>
            {shown && <span className="label" style={{ color: 'var(--fg-2)' }}>{KIND_LABEL[shown.kind]} · {shown.name}</span>}
            {shown && (
              <div className="end">
                {mode === 'walker' && (
                  <button className="btn small" disabled={flying} onClick={() => engine.requestTakeoff()}>{flying ? 'Flying' : 'Take off'}</button>
                )}
                <div className="seg">
                  <button className={mode === 'viewer' ? 'active' : ''} onClick={() => switchMode('viewer')}>Facing screen</button>
                  <button className={mode === 'walker' ? 'active' : ''} onClick={() => switchMode('walker')}>On the page</button>
                </div>
                <button className="icon-btn" title="Close" onClick={() => open(null)}><IconClose /></button>
              </div>
            )}
          </div>
          <div className="stage" ref={stage}>
            {shown?.kind === 'page' && (
              <webview ref={webview as React.Ref<HTMLWebViewElement>} src={shown.url} partition="persist:web" plugins key={shown.url} />
            )}
            {shown?.kind === 'image' && <img ref={media} src={shown.url} alt={shown.name} key={shown.url} />}
            {shown?.kind === 'video' && <video ref={media} src={shown.url} key={shown.url} autoPlay loop muted controls />}
            {shown?.kind === 'demo' && <div className="demo-host" ref={demoHost} />}
            {shown && <canvas className="overlay" ref={overlay} />}
            {!shown && (
              <div className={'empty' + (dragging ? ' dragging' : '')}>
                <Tunnel />
                <h2>Show the fly<br /><span>something.</span></h2>
                <div className="row">
                  <button className="btn primary" onClick={pickFile}><IconFile /> Open a file</button>
                  {SITES.map((s) => (
                    <button key={s} className="btn" onClick={() => go(s)}><IconGlobe /> {s.replace(/^www\./, '')}</button>
                  ))}
                </div>
                <div className="row">
                  {DEMOS.map((d) => (
                    <button key={d} className="btn small" onClick={() => demo(d)}>{STIMULUS_LABEL[d]}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="cell">
          <div className="cell-head">
            <span className="label">Neural activity</span>
            <div className="end">
              {silenced > 0 && <span className="label" style={{ color: 'var(--red)' }}>{silenced} silenced</span>}
              <span className="label">{Math.round(engine.fps)} Hz · {engine.stepMs.toFixed(1)} ms</span>
              <button className="icon-btn more" title="Statistics and history" onClick={() => window.fly.stats.open()}><IconMore /></button>
            </div>
          </div>
          <div className="cell-body">
            <BrainView active={active} shiftX={0.14} />
            <ActiveList />
          </div>
        </section>

        <div className="readout-row">
          <BehaviourCard />
          <FlyEyeCard />
        </div>
      </div>
    </>
  );
}
