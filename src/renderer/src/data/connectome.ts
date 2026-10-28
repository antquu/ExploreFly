/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Loads the files written by scripts/build-data.mjs.
// A node is one cell type on one side of the body (e.g. LC4 left).

export type Side = 'L' | 'R' | 'M' | 'C' | 'U';

export interface NodeInfo {
  t: string;
  s: Side;
  sc: string;
  c?: string;
  sub?: string;
  fw?: string;
  hb?: string;
  syn?: string;
  fru?: string;
  rec?: string;
  dim?: string;
  nv?: string;
  hl?: string;
  nt?: string;
  ntc?: number;
  n: number;
  iw: number;
  ow: number;
  p?: [number, number, number];
  ti: [number, number][];
  to: [number, number][];
  u?: 1;
}

export interface Connectome {
  meta: { source: string; url: string; neurons: number; nodes: number; edges: number; built: string };
  nodes: NodeInfo[];
  offsets: Uint32Array;
  src: Uint32Array;
  weight: Float32Array;
  points: { count: number; scale: number; xyz: Int16Array; node: Uint32Array };
  byType: Map<string, number[]>;
}

const base = './data/';

export async function loadConnectome(onProgress?: (p: number) => void): Promise<Connectome> {
  let done = 0;
  const tick = <T,>(p: Promise<T>) => p.then((v) => { onProgress?.(++done / 3); return v; });
  const [json, graph, pts] = await Promise.all([
    tick(fetch(base + 'nodes.json').then((r) => r.json())),
    tick(fetch(base + 'graph.bin').then((r) => r.arrayBuffer())),
    tick(fetch(base + 'points.bin').then((r) => r.arrayBuffer())),
  ]);

  const [N, E] = new Uint32Array(graph, 0, 2);
  const offsets = new Uint32Array(graph, 8, N + 1);
  const src = new Uint32Array(graph, 8 + 4 * (N + 1), E);
  const weight = new Float32Array(graph, 8 + 4 * (N + 1) + 4 * E, E);

  const P = new Uint32Array(pts, 0, 1)[0];
  const scale = new Float32Array(pts, 4, 1)[0];
  const pad = (8 + 6 * P) % 4;
  const xyz = new Int16Array(pts, 8, 3 * P);
  const node = new Uint32Array(pts, 8 + 6 * P + pad, P);

  const nodes = json.nodes as NodeInfo[];
  const byType = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const list = byType.get(n.t);
    if (list) list.push(i);
    else byType.set(n.t, [i]);
  });

  return { meta: json.meta, nodes, offsets, src, weight, points: { count: P, scale, xyz, node }, byType };
}

// Finds node indices for a list of exact types or /regex/ patterns, optionally on one side
export function select(c: Connectome, patterns: (string | RegExp)[], side?: Side): number[] {
  const out: number[] = [];
  for (const p of patterns) {
    if (typeof p === 'string') {
      for (const i of c.byType.get(p) ?? []) if (!side || c.nodes[i].s === side) out.push(i);
    } else {
      c.nodes.forEach((n, i) => {
        if (p.test(n.t) && (!side || n.s === side)) out.push(i);
      });
    }
  }
  return [...new Set(out)];
}

export const SUPERCLASS_LABEL: Record<string, string> = {
  ol_intrinsic: 'Optic lobe (intrinsic)',
  ol_sensory: 'Photoreceptors',
  visual_projection: 'Visual projection',
  visual_centrifugal: 'Visual centrifugal',
  cb_intrinsic: 'Central brain',
  cb_sensory: 'Sensory (head)',
  cb_motor: 'Motor (head)',
  cb_endocrine: 'Endocrine',
  cb_efferent: 'Efferent (head)',
  descending_neuron: 'Descending neuron',
  ascending_neuron: 'Ascending neuron',
  vnc_intrinsic: 'Ventral nerve cord (VNC)',
  vnc_sensory: 'Sensory (body)',
  vnc_motor: 'Motor neuron',
  vnc_efferent: 'Efferent (body)',
  vnc_endocrine: 'Endocrine (VNC)',
  sensory_ascending: 'Ascending sensory',
  sensory_descending: 'Descending sensory',
  ENS: 'Enteric system',
};

export const NT_LABEL: Record<string, string> = {
  acetylcholine: 'Acetylcholine',
  gaba: 'GABA',
  glutamate: 'Glutamate',
  dopamine: 'Dopamine',
  serotonin: 'Serotonin',
  octopamine: 'Octopamine',
  histamine: 'Histamine',
  tyramine: 'Tyramine',
};

export const SIDE_LABEL: Record<string, string> = { L: 'left', R: 'right', M: 'midline', C: 'centre', U: 'unsided' };

export const superLabel = (sc: string) =>
  SUPERCLASS_LABEL[sc] ?? SUPERCLASS_LABEL[sc.replace(/_tbc$/, '')] ?? sc.replace(/_/g, ' ');
