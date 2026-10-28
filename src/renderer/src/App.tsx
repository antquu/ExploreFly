/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import type { UpdateStatus } from '../../preload';
import { loadConnectome, type Connectome } from './data/connectome';
import { Engine } from './sim/engine';
import { AppContext, loadSettings, saveSettings, type Settings } from './state';
import { IconData, IconExplore, IconGitHub, IconLive, Logo } from './ui/icons';
import LiveView from './views/LiveView';
import ExploreView from './views/ExploreView';
import DataView from './views/DataView';
import { version } from '../../../package.json';

type View = 'live' | 'explore' | 'data';

const REPO = 'https://github.com/antquu/ExploreFly';

export default function App() {
  const [c, setC] = useState<Connectome | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConnectome(setProgress).then(setC).catch((e) => setError(String(e)));
  }, []);

  if (!c) {
    return (
      <div className="loading">
        <div className="loading-inner">
          <Logo />
          <div className="bar-meter"><i style={{ width: progress * 100 + '%' }} /></div>
          <p>{error ?? 'Loading the connectome'}</p>
        </div>
      </div>
    );
  }
  return <Shell c={c} />;
}

function Shell({ c }: { c: Connectome }) {
  const engine = useMemo(() => new Engine(c), [c]);
  const [view, setView] = useState<View>('live');
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [perturbVersion, setPerturbVersion] = useState(0);

  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' });

  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);

  // Streams the session history to the statistics window while it is open
  useEffect(() => {
    const stats = window.fly.stats;
    let timer = 0;
    const push = (full: boolean) => stats.push(engine.history.payload(full));
    const offs = [
      stats.onRequest(() => push(true)),
      stats.onState((open) => {
        clearInterval(timer);
        if (open) timer = window.setInterval(() => push(false), 1000);
      }),
      stats.onCommand((cmd) => {
        if (cmd === 'clear') {
          engine.history.clear();
          push(true);
        }
      }),
    ];
    return () => {
      clearInterval(timer);
      offs.forEach((off) => off());
    };
  }, [engine]);

  useEffect(() => {
    window.fly.update.current().then(setUpdate);
    return window.fly.update.onStatus(setUpdate);
  }, []);

  const state = useMemo(() => ({
    c,
    engine,
    settings,
    setSettings: (s: Settings) => {
      setSettingsState(s);
      saveSettings(s);
    },
    perturbVersion,
    bumpPerturb: () => setPerturbVersion((v) => v + 1),
  }), [c, engine, settings, perturbVersion]);

  return (
    <AppContext.Provider value={state}>
      <div className="app">
        <aside className="side">
          <div className="brand"><Logo /> ExploreFly</div>
          <nav className="nav">
            <button className={view === 'live' ? 'active' : ''} onClick={() => setView('live')}><IconLive /> Live</button>
            <button className={view === 'explore' ? 'active' : ''} onClick={() => setView('explore')}><IconExplore /> Explore</button>
            <button className={view === 'data' ? 'active' : ''} onClick={() => setView('data')}><IconData /> Data</button>
          </nav>
          <div className="side-foot">
            {update.state === 'downloading' && <div>Downloading v{update.version} · {update.percent} %</div>}
            {update.state === 'ready' && (
              <button className="btn small primary" onClick={() => window.fly.update.install()}>Restart to update</button>
            )}
            <div className="version-row">
              <span>ExploreFly v{version}</span>
              <button className="icon-btn" title="github.com/antquu/ExploreFly" onClick={() => window.fly.openExternal(REPO)}><IconGitHub /></button>
            </div>
          </div>
        </aside>
        <main className="main">
          <div className={'view' + (view === 'live' ? ' visible' : '')}><LiveView active={view === 'live'} /></div>
          <div className={'view' + (view === 'explore' ? ' visible' : '')}><ExploreView active={view === 'explore'} /></div>
          {view === 'data' && <div className="view visible"><DataView /></div>}
        </main>
      </div>
    </AppContext.Provider>
  );
}
