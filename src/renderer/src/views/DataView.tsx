/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Data and model tab: where the numbers come from, how the simulation works, settings.
import { useMemo } from 'react';
import { useApp, type Quality } from '../state';
import { superLabel } from '../data/connectome';

const fmt = (n: number) => n.toLocaleString('en-US');

export default function DataView() {
  const { c, settings, setSettings, engine } = useApp();

  const stats = useMemo(() => {
    let synapses = 0;
    const bySuper = new Map<string, number>();
    for (const n of c.nodes) {
      synapses += n.iw;
      bySuper.set(n.sc, (bySuper.get(n.sc) ?? 0) + n.n);
    }
    const types = new Set(c.nodes.filter((n) => !n.u).map((n) => n.t)).size;
    const top = [...bySuper.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { synapses, types, top };
  }, [c]);

  const setQuality = (quality: Quality) => setSettings({ ...settings, quality });
  const p = engine.fly.brain.params;

  return (
    <>
      <div className="bar"><span className="label">Data and model</span><div className="grow" /></div>
      <div className="data">
        <div className="hero">
          <div className="label" style={{ marginBottom: 18 }}>Source · {c.meta.source}</div>
          <h1>A real nervous system, <span>one neuron at a time.</span></h1>
          <p>
            ExploreFly is built on MaleCNS v1.0, the complete reconstruction of a male fruit fly&apos;s central nervous system
            released in 2026 by Google Research and the HHMI Janelia FlyEM project: brain, optic lobes and ventral nerve cord,
            down to single synapses, from electron microscopy images.
          </p>
        </div>

        <div className="stats">
          <div className="stat"><b>{fmt(c.meta.neurons)}</b><span>annotated neurons</span></div>
          <div className="stat"><b>{fmt(stats.types)}</b><span>cell types</span></div>
          <div className="stat"><b>{(stats.synapses / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} M</b><span>synaptic connections between traced neurons</span></div>
          <div className="stat"><b>{fmt(c.meta.edges)}</b><span>simulated type → type links</span></div>
        </div>

        <div className="articles">
          <article className="article">
            <div className="label">Data</div>
            <h3>From neurons to cell types</h3>
            <p>
              The 25 million connected neuron pairs are grouped by cell type and body side, which gives {fmt(c.meta.nodes)} nodes.
              Each node keeps its 40 strongest inputs, normalised by its total number of input synapses. The sign comes from the
              predicted neurotransmitter (acetylcholine excites; GABA, glutamate and histamine inhibit).
            </p>
            <p><code>scripts/build-data.mjs</code> rebuilds everything from Janelia&apos;s public bucket.</p>
          </article>
          <article className="article">
            <div className="label">Model</div>
            <h3>A firing-rate network</h3>
            <div className="formula">
              τ·dr/dt = −r + [tanh(g·Σ wᵢ·sᵢ·rᵢ + I − a − θ)]₊<br />
              τₐ·da/dt = k·r − a
            </div>
            <p>
              g = {p.gain}, τ = {p.tau * 1000} ms, τₐ = {p.tauAdapt} s. Adaptation a makes responses transient, like real
              neurons. Activity is only pushed from active nodes, so a step takes a few milliseconds.
            </p>
          </article>
          <article className="article">
            <div className="label">Vision</div>
            <h3>A simulated compound eye</h3>
            <p>
              The image is sampled on 2 × 18 × 16 ommatidia with the fly&apos;s spectral sensitivity (red is ignored). The eye
              extracts brightness (R1–R6), UV and green (R7, R8), motion with a Hassenstein–Reichardt correlator (T4/T5), the
              radial expansion of a dark area (LC4, LPLC2) and small targets (LC10, LC11).
            </p>
          </article>
          <article className="article">
            <div className="label">Behaviour</div>
            <h3>Where the fly wants to go</h3>
            <p>
              The decision is read from descending neurons identified in experiments: DNa01, DNa02 and HS cells to turn, the Giant
              Fiber (DNp01) to take off, P9 (DNp09) to walk forward and MDN to back up. Fixation on vertical contrast, well
              described in flies but with an incomplete circuit, is added as a reflex.
            </p>
          </article>
          <article className="article">
            <div className="label">Limits</div>
            <h3>What the model does not tell</h3>
            <p>
              A connectome gives the wiring, not the dynamics: no neuromodulation, gap junctions or plasticity, and a single
              individual. Responses are qualitative. They let you test circuit hypotheses, not predict the exact activity of a
              real fly.
            </p>
          </article>
          <article className="article">
            <div className="label">Composition</div>
            <h3>What the CNS is made of</h3>
            <div className="meters" style={{ gridTemplateColumns: '1fr 90px 54px', marginTop: 4 }}>
              {stats.top.map(([sc, n]) => (
                <span key={sc} style={{ display: 'contents' }}>
                  <span>{superLabel(sc)}</span>
                  <div className="bar-meter"><i style={{ width: (n / stats.top[0][1]) * 100 + '%' }} /></div>
                  <span className="v">{fmt(n)}</span>
                </span>
              ))}
            </div>
          </article>
        </div>

        <div className="section"><span className="label">Settings</span></div>
        <div>
          <div className="setting">
            <div><b>3D quality</b><span>Low keeps one soma in three, for modest computers.</span></div>
            <div className="seg">
              {(['low', 'medium', 'high'] as Quality[]).map((q) => (
                <button key={q} className={settings.quality === q ? 'active' : ''} onClick={() => setQuality(q)}>
                  {q === 'low' ? 'Low' : q === 'medium' ? 'Balanced' : 'High'}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <div><b>Auto-rotate</b><span>The brain spins on its own and stops as soon as you grab it.</span></div>
            <div className="seg">
              <button className={settings.autoRotate ? 'active' : ''} onClick={() => setSettings({ ...settings, autoRotate: true })}>On</button>
              <button className={!settings.autoRotate ? 'active' : ''} onClick={() => setSettings({ ...settings, autoRotate: false })}>Off</button>
            </div>
          </div>
        </div>

        <div className="section"><span className="label">References</span></div>
        <div className="articles">
          <article className="article">
            <h3>MaleCNS v1.0</h3>
            <p>Google Research and HHMI Janelia FlyEM (2026). Connectome of the male central nervous system. Data under CC BY 4.0.</p>
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => window.fly.openExternal('https://male-cns.janelia.org/')}>male-cns.janelia.org</button>
          </article>
          <article className="article">
            <h3>Connectome models</h3>
            <p>Shiu et al. (2024), whole-brain model on FlyWire; Lappalainen et al. (2024), connectome-constrained network of the visual system.</p>
          </article>
          <article className="article">
            <h3>ExploreFly</h3>
            <p>Free software under the GNU General Public License v3 or later. Designed and built by antquu. It comes with no warranty; you may redistribute and modify it under the terms of the licence.</p>
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => window.fly.openExternal('https://www.gnu.org/licenses/gpl-3.0.html')}>GNU GPL v3</button>
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => window.fly.openExternal('https://github.com/antquu/ExploreFly')}>github.com/antquu/ExploreFly</button>
          </article>
        </div>
      </div>
    </>
  );
}
