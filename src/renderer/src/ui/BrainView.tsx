/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useRef } from 'react';
import { BrainScene } from '../brain/BrainScene';
import { useApp } from '../state';

interface Props {
  active: boolean;
  highlight?: number[];
  focus?: number | null;
  shiftX?: number;
  onPick?: (node: number | null) => void;
  onHover?: (node: number | null, x: number, y: number) => void;
}

const NONE: number[] = [];

export default function BrainView({ active, highlight = NONE, focus = null, shiftX = 0, onPick, onHover }: Props) {
  const { c, engine, settings, perturbVersion } = useApp();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BrainScene | null>(null);
  const handlers = useRef({ onPick, onHover });
  handlers.current = { onPick, onHover };

  // Rebuilt only when the quality setting changes
  useEffect(() => {
    const s = new BrainScene(host.current!, c, {
      quality: settings.quality,
      autoRotate: settings.autoRotate,
      shiftX,
      onPick: (n) => handlers.current.onPick?.(n),
      onHover: (n, x, y) => handlers.current.onHover?.(n, x, y),
    });
    scene.current = s;
    const off = engine.subscribe(() => s.setActivity(engine.fly.brain.rate));
    return () => {
      off();
      s.dispose();
      scene.current = null;
    };
  }, [c, engine, settings.quality, shiftX]);

  useEffect(() => scene.current?.setAutoRotate(settings.autoRotate), [settings.autoRotate]);
  useEffect(() => scene.current?.setActive(active), [active]);

  useEffect(() => {
    scene.current?.setFlags(highlight, engine.fly.brain.silenced);
  }, [highlight, perturbVersion, engine, settings.quality]);

  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.focus(focus);
    if (focus === null) {
      s.setLinks(null);
      return;
    }
    const node = c.nodes[focus];
    s.setLinks(focus, [
      ...node.ti.map(([n, w]) => ({ node: n, strength: w, out: false })),
      ...node.to.map(([n, w]) => ({ node: n, strength: w, out: true })),
    ]);
  }, [focus, c, settings.quality]);

  return <div className="brain-host" ref={host} />;
}
