/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Explore tab: the whole CNS full screen, a card under the cursor for any neuron,
// Ctrl+K search over circuits, genes and cell types, and an in-silico lab.
import { useEffect, useMemo, useRef, useState } from 'react';
import BrainView from '../ui/BrainView';
import { Compass } from '../ui/Readouts';
import { IconClose, IconSearch } from '../ui/icons';
import { useApp, useEngineTick } from '../state';
import { NT_LABEL, SIDE_LABEL, superLabel, type Connectome, type NodeInfo } from '../data/connectome';
import { SYSTEMS, geneIndex, systemNodes, type System } from '../data/systems';
import { CHEMICAL, STIMULUS_LABEL, StimulusPlayer, VISUAL, isVisual, type StimulusKind, type VisualStimulus } from '../sim/stimuli';
import { INTENT_LABEL, type ChemicalStimulus } from '../sim/fly';

type Selection = { kind: 'system'; id: string } | { kind: 'gene'; symbol: string } | { kind: 'node'; index: number } | null;
type Hit = { kind: 'system'; s: System } | { kind: 'gene'; g: (typeof GENES)[number] } | { kind: 'node'; i: number };

const GENES = geneIndex();
const fmt = (n: number) => n.toLocaleString('en-US');
const neurons = (n: number) => `${fmt(n)} ${n > 1 ? 'neurons' : 'neuron'}`;

const SHORT_STIM: Record<string, string> = {
  loomL: 'Loom L', loomR: 'Loom R', gratingL: 'Stripes ←', gratingR: 'Stripes →', target: 'Target', flash: 'Flash',
  vinegar: 'Vinegar', cva: 'cVA', co2: 'CO₂', sugar: 'Taste', touch: 'Touch',
};

const LEGEND: [string, string][] = [
  ['Optic lobe', '#8c99ad'], ['Visual projection', '#809ecc'], ['Central brain', '#b8b8c2'], ['Sensory', '#99b89e'],
  ['Descending', '#f2c780'], ['Ascending', '#bf9ee6'], ['VNC', '#999aa8'], ['Motor', '#e6998c'],
];

function neuronCount(c: Connectome, nodes: number[]) {
  return nodes.reduce((s, i) => s + c.nodes[i].n, 0);
}

function search(c: Connectome, q: string): Hit[] {
  const query = q.trim().toLowerCase();
  const systems: Hit[] = SYSTEMS
    .filter((s) => !query || `${s.title} ${s.area} ${s.summary}`.toLowerCase().includes(query))
    .map((s) => ({ kind: 'system', s }));
  if (!query) return systems;
  const genes: Hit[] = GENES
    .filter((g) => `${g.symbol} ${g.name}`.toLowerCase().includes(query))
    .map((g) => ({ kind: 'gene', g }));
  const nodes: number[] = [];
  c.nodes.forEach((n, i) => {
    if (n.u) return;
    if (`${n.t} ${n.syn ?? ''} ${n.hb ?? ''} ${n.fw ?? ''}`.toLowerCase().includes(query)) nodes.push(i);
  });
  const rank = (i: number) => (c.nodes[i].t.toLowerCase() === query ? 0 : c.nodes[i].t.toLowerCase().startsWith(query) ? 1 : 2);
  nodes.sort((a, b) => rank(a) - rank(b) || c.nodes[b].n - c.nodes[a].n);
  return [...systems.slice(0, 5), ...genes.slice(0, 5), ...nodes.slice(0, 40).map((i): Hit => ({ kind: 'node', i }))];
}

function HoverCard({ c, i, x, y, rate }: { c: Connectome; i: number; x: number; y: number; rate: number }) {
  const n: NodeInfo = c.nodes[i];
  const total = (c.byType.get(n.t) ?? [i]).reduce((s, k) => s + c.nodes[k].n, 0);
  const left = x + 300 > window.innerWidth ? x - 296 : x + 16;
  const top = Math.min(y + 16, window.innerHeight - 250);
  return (
    <div className="hovercard" style={{ left, top }}>
      <div className="cell-head"><span className="label">{superLabel(n.sc)}</span><span className="end label">{SIDE_LABEL[n.s]}</span></div>
      <div className="in">
        <h4>{n.t}</h4>
        {n.syn && <p>{n.syn}</p>}
        <div className="kv">
          <span>Neurons</span><span>{fmt(n.n)} · {fmt(total)} in total</span>
          {n.nt && <><span>Transm.</span><span>{NT_LABEL[n.nt] ?? n.nt}</span></>}
          {n.ti[0] && <><span>Input</span><span>{c.nodes[n.ti[0][0]].t} · {fmt(n.ti[0][1])} syn.</span></>}
          {n.to[0] && <><span>Output</span><span>{c.nodes[n.to[0][0]].t} · {fmt(n.to[0][1])} syn.</span></>}
          {n.fru && <><span>fru/dsx</span><span>{n.fru.replace(/_/g, ' ')}</span></>}
          <span>Activity</span><span>{Math.round(rate * 100)} %</span>
        </div>
      </div>
    </div>
  );
}

function BehaviourFloat() {
  useEngineTick(10);
  const { engine } = useApp();
  const b = engine.fly.behaviour;
  return (
    <div className="behaviour-float">
      <div className="cell-head"><span className="label">Intent</span></div>
      <div className="readout">
        <div className="intent">
          <Compass turn={b.turn} escape={b.escape} />
          <div><h3>{INTENT_LABEL[b.intent]}</h3><p>Escape {Math.round(b.escape * 100)} · turn {b.turn < -0.02 ? 'L' : b.turn > 0.02 ? 'R' : '·'}</p></div>
        </div>
      </div>
    </div>
  );
}

export default function ExploreView({ active }: { active: boolean }) {
  const { c, engine, perturbVersion, bumpPerturb } = useApp();
  const [query, setQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState<Selection>(null);
  const [hover, setHover] = useState<{ node: number; x: number; y: number } | null>(null);
  const [stim, setStim] = useState<VisualStimulus | null>(null);
  const [chem, setChem] = useState<ChemicalStimulus[]>([]);
  const player = useMemo(() => new StimulusPlayer(), []);
  const preview = useRef<HTMLCanvasElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const brain = engine.fly.brain;

  const systemsNodes = useMemo(() => new Map(SYSTEMS.map((s) => [s.id, systemNodes(c, s)])), [c]);
  const hits = useMemo(() => search(c, query), [c, query]);

  // Engine input while this tab is visible: the lab stimulus, grey when idle
  useEffect(() => {
    if (!active) {
      engine.fly.activeChemicals.forEach((k) => engine.fly.setChemical(k, 0));
      return;
    }
    engine.setProvider((dt) => player.frame(dt));
    chem.forEach((k) => engine.fly.setChemical(k, 1));
  }, [active, engine, player, chem]);

  useEffect(() => {
    const draw = () => {
      const cv = preview.current;
      if (!cv) return;
      if (cv.width !== player.canvas.width) { cv.width = player.canvas.width; cv.height = player.canvas.height; }
      cv.getContext('2d')!.drawImage(player.canvas, 0, 0);
    };
    return engine.subscribe(draw);
  }, [engine, player]);

  // Ctrl+K opens the search, Escape closes it
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        setPaletteOpen(true);
      } else if (e.key === 'Escape') {
        setPaletteOpen(false);
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [active]);

  const choose = (h: Hit) => {
    if (h.kind === 'system') setSel({ kind: 'system', id: h.s.id });
    else if (h.kind === 'gene') setSel({ kind: 'gene', symbol: h.g.symbol });
    else setSel({ kind: 'node', index: h.i });
    setPaletteOpen(false);
    searchRef.current?.blur();
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((k) => Math.min(hits.length - 1, k + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((k) => Math.max(0, k - 1)); }
    if (e.key === 'Enter' && hits[cursor]) choose(hits[cursor]);
  };

  const log = engine.history.log.bind(engine.history);

  const playVisual = (k: VisualStimulus | null) => {
    player.play(k);
    setStim(k);
    log('stimulus', k ? `Stimulus · ${STIMULUS_LABEL[k]}` : 'Visual stimulus stopped');
  };

  const toggleChem = (k: ChemicalStimulus) => {
    const on = !chem.includes(k);
    engine.fly.setChemical(k, on ? 1 : 0);
    setChem(on ? [...chem, k] : chem.filter((x) => x !== k));
    log('stimulus', `${STIMULUS_LABEL[k]} ${on ? 'on' : 'off'}`);
  };

  const startStimulus = (k: StimulusKind) => {
    if (isVisual(k)) playVisual(k);
    else if (!chem.includes(k)) toggleChem(k);
  };

  // ---------- Perturbations ----------
  const allSilenced = (nodes: number[]) => nodes.length > 0 && nodes.every((i) => brain.silenced[i]);
  const allActivated = (nodes: number[]) => nodes.length > 0 && nodes.every((i) => brain.clamped[i] >= 0);
  const names = (nodes: number[]) => {
    const types = [...new Set(nodes.map((i) => c.nodes[i].t))];
    return types.length > 3 ? `${types.slice(0, 3).join(', ')} +${types.length - 3}` : types.join(', ');
  };
  const silence = (nodes: number[], on: boolean) => {
    log('perturb', `${on ? 'Silenced' : 'Restored'} · ${names(nodes)}`);
    for (const i of nodes) {
      brain.silenced[i] = on ? 1 : 0;
      if (on) brain.clamped[i] = -1;
    }
    bumpPerturb();
  };
  const activate = (nodes: number[], on: boolean) => {
    log('perturb', `${on ? 'Activated' : 'Released'} · ${names(nodes)}`);
    for (const i of nodes) {
      brain.clamped[i] = on ? 0.9 : -1;
      if (on) brain.silenced[i] = 0;
    }
    bumpPerturb();
  };
  const resetAll = () => {
    brain.silenced.fill(0);
    brain.clamped.fill(-1);
    brain.reset();
    playVisual(null);
    chem.forEach((k) => engine.fly.setChemical(k, 0));
    setChem([]);
    bumpPerturb();
    log('perturb', 'Lab reset');
  };

  const runExperiment = (s: System) => {
    if (!s.experiment) return;
    resetAll();
    log('stimulus', `Experiment · ${s.title}`);
    if (s.experiment.silence) silence(systemsNodes.get(s.id) ?? [], true);
    startStimulus(s.experiment.stimulus);
  };

  // ---------- Selection ----------
  const selNodes = useMemo(() => {
    if (!sel) return [];
    if (sel.kind === 'system') return systemsNodes.get(sel.id) ?? [];
    if (sel.kind === 'gene') {
      const g = GENES.find((x) => x.symbol === sel.symbol);
      return [...new Set(g?.systems.flatMap((s) => systemsNodes.get(s.id) ?? []) ?? [])];
    }
    return c.byType.get(c.nodes[sel.index].t) ?? [sel.index];
  }, [sel, systemsNodes, c]);

  // The hovered cell type lights up too, on both sides
  const lit = useMemo(() => {
    if (!hover) return selNodes;
    const extra = c.byType.get(c.nodes[hover.node].t) ?? [];
    return selNodes.length ? [...selNodes, ...extra] : extra;
  }, [hover?.node, selNodes, c]);

  const counts = useMemo(() => {
    let s = 0, a = 0;
    for (let i = 0; i < brain.n; i++) {
      if (brain.silenced[i]) s++;
      if (brain.clamped[i] >= 0) a++;
    }
    return { s, a };
  }, [brain, perturbVersion]);

  return (
    <>
      <div className="bar">
        <div className="grow" />
        <div className="search-wrap">
          <label className="field">
            <IconSearch />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCursor(0); setPaletteOpen(true); }}
              onFocus={() => setPaletteOpen(true)}
              onBlur={() => setTimeout(() => setPaletteOpen(false), 150)}
              onKeyDown={onSearchKey}
              placeholder="Neuron, circuit, gene…"
              spellCheck={false}
            />
            <span className="kbd">Ctrl K</span>
          </label>
          {paletteOpen && (
            <div className="palette">
              {hits.length === 0 && <div className="group faint">No results</div>}
              {hits.map((h, k) => {
                const prevKind = k > 0 ? hits[k - 1].kind : null;
                const head = h.kind !== prevKind ? { system: 'Circuits', gene: 'Genes', node: 'Cell types' }[h.kind] : null;
                return (
                  <div key={k}>
                    {head && <div className="group label">{head}</div>}
                    <button className={k === cursor ? 'cursor' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(h)}>
                      {h.kind === 'system' && <><span>{h.s.title}</span><span className="meta">{h.s.area}</span></>}
                      {h.kind === 'gene' && <><i>{h.g.symbol}</i><span className="sub">{h.g.name}</span></>}
                      {h.kind === 'node' && <><span>{c.nodes[h.i].t}</span><span className="sub">{c.nodes[h.i].syn ?? superLabel(c.nodes[h.i].sc)}</span><span className="meta">{c.nodes[h.i].s} · {fmt(c.nodes[h.i].n)}</span></>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="grow" />
      </div>

      <div className={'explore' + (sel ? '' : ' no-detail')}>
        <BrainView
          active={active}
          highlight={lit}
          focus={sel?.kind === 'node' ? sel.index : null}
          shiftX={0.05}
          onPick={(n) => n !== null && setSel({ kind: 'node', index: n })}
          onHover={(n, x, y) => setHover(n === null ? null : { node: n, x, y })}
        />

        <div className="circuits">
          <div className="cell-head"><span className="label">Circuits</span><span className="end label">{SYSTEMS.length}</span></div>
          <div className="list">
            {SYSTEMS.map((s) => (
              <button key={s.id} className={sel?.kind === 'system' && sel.id === s.id ? 'selected' : ''} onClick={() => setSel({ kind: 'system', id: s.id })}>
                <b>{s.title}</b>
                <span>{s.area} · {fmt(neuronCount(c, systemsNodes.get(s.id) ?? []))}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="legend">
          {LEGEND.map(([l, col]) => <span key={l}><i style={{ background: col }} />{l}</span>)}
        </div>

        <div className="lab">
          <div className="cell-head">
            <span className="label">Lab</span>
            <div className="end">
              <span className="label">{counts.s} silenced · {counts.a} activated</span>
              <button className="btn small" onClick={resetAll}>Reset</button>
            </div>
          </div>
          <div className="body">
            <canvas className="lab-preview" ref={preview} />
            <div className="controls">
              <div className="row">
                {VISUAL.map((k) => (
                  <button key={k} title={STIMULUS_LABEL[k]} className={'btn small' + (stim === k ? ' on' : '')} onClick={() => playVisual(stim === k ? null : k)}>{SHORT_STIM[k]}</button>
                ))}
              </div>
              <div className="row">
                {CHEMICAL.map((k) => (
                  <button key={k} title={STIMULUS_LABEL[k]} className={'btn small' + (chem.includes(k) ? ' on' : '')} onClick={() => toggleChem(k)}>{SHORT_STIM[k]}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <BehaviourFloat />

        {sel && (
          <div className="detail-panel">
            <Detail
              sel={sel}
              nodes={selNodes}
              systemsNodes={systemsNodes}
              onSelect={setSel}
              silence={silence}
              activate={activate}
              allSilenced={allSilenced}
              allActivated={allActivated}
              runExperiment={runExperiment}
              perturbVersion={perturbVersion}
            />
          </div>
        )}

        {hover && !paletteOpen && <HoverCard c={c} i={hover.node} x={hover.x} y={hover.y} rate={brain.rate[hover.node]} />}
      </div>
    </>
  );
}

interface DetailProps {
  sel: Selection;
  nodes: number[];
  systemsNodes: Map<string, number[]>;
  onSelect: (s: Selection) => void;
  silence: (nodes: number[], on: boolean) => void;
  activate: (nodes: number[], on: boolean) => void;
  allSilenced: (nodes: number[]) => boolean;
  allActivated: (nodes: number[]) => boolean;
  runExperiment: (s: System) => void;
  perturbVersion: number;
}

function Perturb({ nodes, p }: { nodes: number[]; p: DetailProps }) {
  const s = p.allSilenced(nodes), a = p.allActivated(nodes);
  return (
    <div className="actions">
      <button className={'btn small danger' + (s ? ' on' : '')} onClick={() => p.silence(nodes, !s)} title="Like expressing Kir2.1 or shibire(ts)">
        {s ? 'Silenced' : 'Silence'}
      </button>
      <button className={'btn small' + (a ? ' on' : '')} onClick={() => p.activate(nodes, !a)} title="Like optogenetics with CsChrimson">
        {a ? 'Activated' : 'Activate (optogenetics)'}
      </button>
    </div>
  );
}

function Head({ label, side, onClose }: { label: string; side?: string; onClose: () => void }) {
  return (
    <div className="cell-head">
      <span className="label">{label}</span>
      <div className="end">
        {side && <span className="label">{side}</span>}
        <button className="icon-btn" title="Close" onClick={onClose}><IconClose /></button>
      </div>
    </div>
  );
}

function Detail(p: DetailProps) {
  const { c } = useApp();
  const { sel, nodes } = p;
  if (!sel) return null;
  const close = () => p.onSelect(null);

  if (sel.kind === 'system') {
    const s = SYSTEMS.find((x) => x.id === sel.id)!;
    const types = new Set(nodes.map((i) => c.nodes[i].t));
    return (
      <>
        <Head label={s.area} onClose={close} />
        <div className="detail">
          <h2>{s.title}</h2>
          <p className="lead">{s.summary}</p>
          <p>{s.detail}</p>
          <dl className="facts">
            <dt>Neurons</dt><dd>{fmt(neuronCount(c, nodes))}</dd>
            <dt>Types</dt><dd>{fmt(types.size)}{types.size <= 8 && ` · ${[...types].join(', ')}`}</dd>
          </dl>
          <Perturb nodes={nodes} p={p} />
          {s.experiment && (
            <div className="experiment">
              <div className="label">In-silico experiment</div>
              <p>{s.experiment.text}</p>
              <p className="faint">Expected: {s.experiment.expect}</p>
              <button className="btn small primary" style={{ alignSelf: 'flex-start' }} onClick={() => p.runExperiment(s)}>Run experiment</button>
            </div>
          )}
          {s.genes.length > 0 && (
            <>
              <div className="label">Genes</div>
              <div className="genes">
                {s.genes.map((g) => (
                  <div className="gene" key={g.symbol}><b>{g.symbol}</b><span>{g.name}</span><p>{g.role}</p></div>
                ))}
              </div>
            </>
          )}
          <div className="refs">{s.refs.join(' · ')}</div>
        </div>
      </>
    );
  }

  if (sel.kind === 'gene') {
    const g = GENES.find((x) => x.symbol === sel.symbol)!;
    return (
      <>
        <Head label="Gene" onClose={close} />
        <div className="detail">
          <h2><i>{g.symbol}</i></h2>
          <p className="lead">{g.name}</p>
          <p>{g.role}</p>
          <div className="label">Circuits</div>
          <div className="actions">
            {g.systems.map((s) => (
              <button key={s.id} className="btn small" onClick={() => p.onSelect({ kind: 'system', id: s.id })}>{s.title}</button>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 12.5 }}>
            A connectome does not measure gene expression. The gene → neuron link comes from the literature; only the
            fru/dsx annotations and ppk receptors are part of MaleCNS.
          </p>
        </div>
      </>
    );
  }

  const n = c.nodes[sel.index];
  const typeNodes = c.byType.get(n.t) ?? [sel.index];
  const inSystems = SYSTEMS.filter((s) => (p.systemsNodes.get(s.id) ?? []).includes(sel.index));
  const maxIn = Math.max(1, ...n.ti.map((x) => x[1]));
  const maxOut = Math.max(1, ...n.to.map((x) => x[1]));
  return (
    <>
      <Head label={superLabel(n.sc)} side={SIDE_LABEL[n.s]} onClose={close} />
      <div className="detail">
        <h2>{n.t}</h2>
        {n.syn && <p className="lead">{n.syn}</p>}
        <dl className="facts">
          <dt>Neurons</dt><dd>{neurons(n.n)} · {fmt(typeNodes.reduce((s, i) => s + c.nodes[i].n, 0))} in total</dd>
          {n.nt && <><dt>Transmitter</dt><dd>{NT_LABEL[n.nt] ?? n.nt}{n.ntc != null && ` · ${Math.round(n.ntc * 100)} %`}</dd></>}
          <dt>Synapses</dt><dd>{fmt(n.iw)} in · {fmt(n.ow)} out</dd>
          {n.c && <><dt>Class</dt><dd>{n.c.replace(/_/g, ' ')}{n.sub ? ` · ${n.sub}` : ''}</dd></>}
          {n.hb && n.hb !== n.t && <><dt>Hemibrain</dt><dd>{n.hb}</dd></>}
          {n.fw && n.fw !== n.t && <><dt>FlyWire</dt><dd>{n.fw}</dd></>}
          {n.fru && <><dt>fru / dsx</dt><dd>{n.fru.replace(/_/g, ' ')}</dd></>}
          {n.rec && <><dt>Receptor</dt><dd>{n.rec.replace(/_/g, ' ')}</dd></>}
          {n.nv && <><dt>Nerve</dt><dd>{n.nv}</dd></>}
          {n.hl && <><dt>Hemilineage</dt><dd>{n.hl}</dd></>}
        </dl>
        <Perturb nodes={typeNodes} p={p} />
        {inSystems.length > 0 && (
          <div className="actions">
            {inSystems.map((s) => <button key={s.id} className="btn small" onClick={() => p.onSelect({ kind: 'system', id: s.id })}>{s.title}</button>)}
          </div>
        )}
        <div className="label">Inputs</div>
        <div className="partners">
          {n.ti.map(([i, w]) => (
            <button className="partner" key={'i' + i} onClick={() => p.onSelect({ kind: 'node', index: i })}>
              <span>{c.nodes[i].t} <span className="faint">{c.nodes[i].s}</span></span>
              <div className="bar-meter"><i style={{ width: (w / maxIn) * 100 + '%' }} /></div>
              <span className="w">{fmt(w)}</span>
            </button>
          ))}
        </div>
        <div className="label">Outputs</div>
        <div className="partners">
          {n.to.map(([i, w]) => (
            <button className="partner out" key={'o' + i} onClick={() => p.onSelect({ kind: 'node', index: i })}>
              <span>{c.nodes[i].t} <span className="faint">{c.nodes[i].s}</span></span>
              <div className="bar-meter"><i style={{ width: (w / maxOut) * 100 + '%' }} /></div>
              <span className="w">{fmt(w)}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
