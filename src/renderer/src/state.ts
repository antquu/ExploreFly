/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createContext, useContext, useEffect, useState } from 'react';
import type { Connectome } from './data/connectome';
import type { Engine } from './sim/engine';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  quality: Quality;
  autoRotate: boolean;
}

const KEY = 'explorefly.settings';

export function defaultQuality(): Quality {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  if (cores <= 2 || memory <= 2) return 'low';
  if (cores <= 4 || memory <= 4) return 'medium';
  return 'high';
}

export function loadSettings(): Settings {
  const fallback: Settings = { quality: defaultQuality(), autoRotate: true };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export interface AppState {
  c: Connectome;
  engine: Engine;
  settings: Settings;
  setSettings: (s: Settings) => void;
  // Bumped whenever silencing or activation changes, so views can refresh
  perturbVersion: number;
  bumpPerturb: () => void;
}

export const AppContext = createContext<AppState | null>(null);

export const useApp = () => useContext(AppContext)!;

// Re-renders the caller at most `hz` times per second while the engine runs
export function useEngineTick(hz = 8) {
  const { engine } = useApp();
  const [, setTick] = useState(0);
  useEffect(() => {
    let last = 0;
    return engine.subscribe(() => {
      const now = performance.now();
      if (now - last < 1000 / hz) return;
      last = now;
      setTick((t) => t + 1);
    });
  }, [engine, hz]);
}
