/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Turns the MaleCNS v1.0 flat connectome (Google Research + HHMI Janelia, CC BY 4.0)
// into the compact files the app loads at startup:
//   nodes.json  one node per (cell type, side) with its metadata
//   graph.bin   type-level connectivity, top inputs of every node (CSR by target)
//   points.bin  soma position of every neuron and the node it belongs to
// Usage: npm run data (downloads the source tables into .cache on first run)
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { tableFromIPC, RecordBatchReader, compressionRegistry, CompressionType } from 'apache-arrow';
import lz4 from 'lz4js';
import { decompress as zstd } from 'fzstd';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache');
const OUT = join(ROOT, 'src', 'renderer', 'public', 'data');
const BUCKET = 'https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/';
const FILES = {
  annotations: 'body-annotations-male-cns-v1.0-minconf-0.5.feather',
  nt: 'body-neurotransmitters-male-cns-v1.0.feather',
  weights: 'connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather',
};
const TOP_INPUTS = 40;
const TOP_LIST = 10;
const MIN_WEIGHT = 3;

compressionRegistry.set(CompressionType.LZ4_FRAME, { decode: (b) => Uint8Array.from(lz4.decompress(b)) });
compressionRegistry.set(CompressionType.ZSTD, { decode: (b) => zstd(b) });

// Downloads a source table unless it is already cached
async function fetchTable(name) {
  const path = join(CACHE, name);
  if (existsSync(path)) return path;
  mkdirSync(CACHE, { recursive: true });
  console.log('downloading', name);
  const res = await fetch(BUCKET + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  await finished(Readable.fromWeb(res.body).pipe(createWriteStream(path)));
  return path;
}

const str = (v) => (v == null || v === '' ? null : String(v));

// ---------- Cell types and sides ----------
const annPath = await fetchTable(FILES.annotations);
const ntPath = await fetchTable(FILES.nt);
const wPath = await fetchTable(FILES.weights);

const ntByType = new Map();
const ntByBody = new Map();
{
  const t = tableFromIPC(readFileSync(ntPath));
  const body = t.getChild('body'), ct = t.getChild('cell_type');
  const ctNt = t.getChild('celltype_predicted_nt'), cons = t.getChild('consensus_nt'), pred = t.getChild('predicted_nt');
  const conf = t.getChild('celltype_predicted_nt_confidence');
  for (let i = 0; i < t.numRows; i++) {
    const nt = str(cons.get(i)) || str(pred.get(i));
    if (nt) ntByBody.set(Number(body.get(i)), nt);
    const type = str(ct.get(i));
    const tnt = str(ctNt.get(i));
    if (type && tnt && !ntByType.has(type)) ntByType.set(type, [tnt, Math.round((conf.get(i) ?? 0) * 100) / 100]);
  }
}

const nodes = [];
const nodeIndex = new Map();
const bodyNode = new Map();
const points = [];
{
  const t = tableFromIPC(readFileSync(annPath));
  const col = (n) => t.getChild(n);
  const c = Object.fromEntries(['bodyId', 'type', 'instance', 'somaSide', 'rootSide', 'superclass', 'class', 'subclass',
    'flywireType', 'hemibrainType', 'synonyms', 'fruDsx', 'receptorType', 'dimorphism', 'somaLocation', 'status',
    'entryNerve', 'exitNerve', 'itoleeHl', 'birthtime'].map((n) => [n, col(n)]));
  for (let i = 0; i < t.numRows; i++) {
    const superclass = str(c.superclass.get(i));
    if (!superclass) continue;
    const bodyId = Number(c.bodyId.get(i));
    const type = str(c.type.get(i)) || `untyped ${superclass.replace(/_/g, ' ')}`;
    const side = (str(c.somaSide.get(i)) || str(c.rootSide.get(i)) || 'M').slice(0, 1).toUpperCase();
    const key = `${type}|${side}`;
    let idx = nodeIndex.get(key);
    if (idx === undefined) {
      idx = nodes.length;
      nodeIndex.set(key, idx);
      nodes.push({
        type, side, superclass,
        cls: str(c.class.get(i)), sub: str(c.subclass.get(i)),
        fw: str(c.flywireType.get(i)), hb: str(c.hemibrainType.get(i)),
        syn: str(c.synonyms.get(i)), fru: null, rec: str(c.receptorType.get(i)),
        dim: str(c.dimorphism.get(i)), nerve: str(c.entryNerve.get(i)) || str(c.exitNerve.get(i)),
        hl: str(c.itoleeHl.get(i)), nt: ntByType.get(type)?.[0] || ntByBody.get(bodyId) || null,
        ntc: ntByType.get(type)?.[1] ?? null, n: 0, inW: 0, outW: 0, pos: [0, 0, 0], np: 0,
        untyped: !str(c.type.get(i)),
      });
    }
    const node = nodes[idx];
    node.n++;
    const fru = str(c.fruDsx.get(i));
    if (fru) node.fru = fru;
    bodyNode.set(bodyId, idx);
    const soma = c.somaLocation.get(i);
    if (soma && soma.length === 3) {
      const p = [Number(soma.get(0)), Number(soma.get(1)), Number(soma.get(2))];
      points.push(p[0], p[1], p[2], idx);
      node.pos[0] += p[0]; node.pos[1] += p[1]; node.pos[2] += p[2]; node.np++;
    }
  }
}
console.log('nodes', nodes.length, 'bodies', bodyNode.size, 'points', points.length / 4);

// ---------- Type-level connectivity ----------
const N = nodes.length;
const pairs = new Map();
{
  const reader = RecordBatchReader.from(readFileSync(wPath));
  let rows = 0;
  for (const b of reader) {
    const preV = b.getChild('body_pre'), postV = b.getChild('body_post'), wV = b.getChild('weight');
    for (let i = 0; i < b.numRows; i++) {
      const a = bodyNode.get(Number(preV.get(i)));
      const z = bodyNode.get(Number(postV.get(i)));
      if (a === undefined || z === undefined) continue;
      const weight = Number(wV.get(i));
      const k = a * N + z;
      pairs.set(k, (pairs.get(k) || 0) + weight);
      nodes[a].outW += weight;
      nodes[z].inW += weight;
    }
    rows += b.numRows;
    if (rows % 5_000_000 < b.numRows) console.log('rows', rows);
  }
}
console.log('type pairs', pairs.size);

const inputs = Array.from({ length: N }, () => []);
const outputs = Array.from({ length: N }, () => []);
for (const [k, w] of pairs) {
  if (w < MIN_WEIGHT) continue;
  const a = Math.floor(k / N), z = k - a * N;
  inputs[z].push([a, w]);
  outputs[a].push([z, w]);
}
pairs.clear();

const offsets = new Uint32Array(N + 1);
const srcList = [];
const wList = [];
for (let z = 0; z < N; z++) {
  const ins = inputs[z].sort((x, y) => y[1] - x[1]);
  nodes[z].topIn = ins.slice(0, TOP_LIST).map(([a, w]) => [a, w]);
  for (const [a, w] of ins.slice(0, TOP_INPUTS)) {
    srcList.push(a);
    wList.push(w / Math.max(1, nodes[z].inW));
  }
  offsets[z + 1] = srcList.length;
}
for (let a = 0; a < N; a++) {
  nodes[a].topOut = outputs[a].sort((x, y) => y[1] - x[1]).slice(0, TOP_LIST).map(([z, w]) => [z, w]);
}
console.log('kept edges', srcList.length);

// ---------- Output ----------
mkdirSync(OUT, { recursive: true });

// graph.bin: [N:u32][E:u32][offsets:u32*(N+1)][src:u32*E][w:f32*E]
{
  const E = srcList.length;
  const buf = new ArrayBuffer(8 + 4 * (N + 1) + 8 * E);
  const head = new Uint32Array(buf, 0, 2);
  head[0] = N; head[1] = E;
  new Uint32Array(buf, 8, N + 1).set(offsets);
  new Uint32Array(buf, 8 + 4 * (N + 1), E).set(srcList);
  new Float32Array(buf, 8 + 4 * (N + 1) + 4 * E, E).set(wList);
  writeFileSync(join(OUT, 'graph.bin'), Buffer.from(buf));
}

// points.bin: [P:u32][scale:f32][xyz:i16*3P][node:u32*P], centred on the CNS bounding box
{
  const P = points.length / 4;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P; i++) for (let d = 0; d < 3; d++) {
    const v = points[i * 4 + d];
    if (v < min[d]) min[d] = v;
    if (v > max[d]) max[d] = v;
  }
  const center = min.map((m, d) => (m + max[d]) / 2);
  const half = Math.max(...max.map((m, d) => (m - min[d]) / 2));
  const scale = half / 32000;
  const pad = (4 + 4 + 6 * P) % 4;
  const buf = new ArrayBuffer(8 + 6 * P + pad + 4 * P);
  new Uint32Array(buf, 0, 1)[0] = P;
  new Float32Array(buf, 4, 1)[0] = scale;
  const xyz = new Int16Array(buf, 8, 3 * P);
  const nodeOf = new Uint32Array(buf, 8 + 6 * P + pad, P);
  for (let i = 0; i < P; i++) {
    for (let d = 0; d < 3; d++) xyz[i * 3 + d] = Math.round((points[i * 4 + d] - center[d]) / scale);
    nodeOf[i] = points[i * 4 + 3];
  }
  writeFileSync(join(OUT, 'points.bin'), Buffer.from(buf));
  console.log('bounds', min, max);
  for (const node of nodes) {
    node.pos = node.np ? node.pos.map((v, d) => Math.round((v / node.np - center[d]) / scale)) : null;
  }
}

// nodes.json: short keys keep the file small
{
  const list = nodes.map((n) => ({
    t: n.type, s: n.side, sc: n.superclass, c: n.cls, sub: n.sub, fw: n.fw, hb: n.hb, syn: n.syn,
    fru: n.fru, rec: n.rec, dim: n.dim, nv: n.nerve, hl: n.hl, nt: n.nt, ntc: n.ntc, n: n.n,
    iw: n.inW, ow: n.outW, p: n.pos, ti: n.topIn, to: n.topOut, u: n.untyped ? 1 : undefined,
  }));
  const meta = {
    source: 'MaleCNS v1.0 (Google Research, HHMI Janelia FlyEM), CC BY 4.0',
    url: 'https://male-cns.janelia.org/',
    neurons: bodyNode.size, nodes: N, edges: srcList.length,
    built: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(join(OUT, 'nodes.json'), JSON.stringify({ meta, nodes: list }, (k, v) => (v === null ? undefined : v)));
}
console.log('done');
