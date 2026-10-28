/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Curated cards: well-studied circuits, the genes that define or shape them,
// and a reproducible in-silico experiment for some of them.
import type { Connectome, NodeInfo } from './connectome';
import type { StimulusKind } from '../sim/stimuli';

export interface Gene {
  symbol: string;
  name: string;
  role: string;
}

export interface Experiment {
  text: string;
  stimulus: StimulusKind;
  silence: boolean;
  expect: string;
}

export interface System {
  id: string;
  title: string;
  area: string;
  summary: string;
  detail: string;
  match: (n: NodeInfo) => boolean;
  genes: Gene[];
  refs: string[];
  experiment?: Experiment;
}

const is = (...types: string[]) => (n: NodeInfo) => types.includes(n.t);
const re = (r: RegExp) => (n: NodeInfo) => r.test(n.t);

export const SYSTEMS: System[] = [
  {
    id: 'photoreceptors',
    title: 'Photoreceptors',
    area: 'Compound eye',
    summary: 'Turn light into electrical signals. Eight cells per ommatidium, about 800 ommatidia per eye.',
    detail:
      'R1–R6 see motion and brightness (broad spectrum, blue-green peak). R7 senses UV and R8 blue or green: these are the colour channels. Flies are almost blind to red, which is why ExploreFly ignores the red channel of images. They release histamine, which inhibits the lamina neurons.',
    match: (n) => n.t === 'R1-R6' || /^R7|^R8/.test(n.t),
    genes: [
      { symbol: 'ninaE', name: 'Rhodopsin 1', role: 'Visual pigment of R1–R6, tuned to blue-green.' },
      { symbol: 'Rh3 / Rh4', name: 'UV rhodopsins', role: 'Expressed in "pale" and "yellow" R7 cells.' },
      { symbol: 'Rh5 / Rh6', name: 'Blue and green rhodopsins', role: 'Expressed in R8: the basis of colour vision.' },
      { symbol: 'norpA', name: 'Phospholipase C', role: 'Phototransduction cascade. A norpA mutant is blind.' },
      { symbol: 'trp', name: 'Transient receptor potential', role: 'Light-gated ion channel that gave its name to the whole TRP family.' },
      { symbol: 'Hdc', name: 'Histidine decarboxylase', role: 'Makes histamine, the photoreceptor neurotransmitter.' },
    ],
    refs: ['Hardie & Juusola 2015', 'Montell 2012'],
  },
  {
    id: 'lamina',
    title: 'Lamina: ON and OFF pathways',
    area: 'Optic lobe',
    summary: 'L1 and L2 split brightening (ON) from dimming (OFF).',
    detail:
      'Lamina monopolar cells receive the photoreceptors directly. L1 feeds the ON pathway (towards T4) and L2 the OFF pathway (towards T5), a split that closely mirrors the vertebrate retina.',
    match: is('L1', 'L2', 'L3', 'L4', 'L5'),
    genes: [
      { symbol: 'ort', name: 'ora transientless', role: 'Histamine-gated chloride channel that receives the photoreceptor signal.' },
      { symbol: 'svp', name: 'seven-up', role: 'Transcription factor that helps specify lamina neuron types.' },
    ],
    refs: ['Joesch et al. 2010', 'Clark et al. 2011'],
  },
  {
    id: 't4t5',
    title: 'Motion detectors T4 / T5',
    area: 'Optic lobe',
    summary: 'Each T4 or T5 cell answers to one direction of motion: forward, backward, up or down.',
    detail:
      'T4 handles bright edges (ON) and T5 dark edges (OFF). Subtypes a, b, c and d each prefer one direction. ExploreFly computes this signal with a Hassenstein–Reichardt correlator (1956), the classic model of insect motion detection, and injects it into these neurons.',
    match: re(/^T[45][a-d]$/),
    genes: [
      { symbol: 'ChAT', name: 'Choline acetyltransferase', role: 'T4 and T5 are cholinergic: they excite their targets.' },
      { symbol: 'Rdl', name: 'Resistant to dieldrin', role: 'GABA-A receptor involved in direction selectivity.' },
      { symbol: 'GluClα', name: 'Glutamate-gated chloride channel', role: 'Carries inhibition in the null direction.' },
    ],
    refs: ['Hassenstein & Reichardt 1956', 'Maisak et al. 2013', 'Borst et al. 2020'],
  },
  {
    id: 'lobula-plate',
    title: 'HS and VS cells',
    area: 'Lobula plate',
    summary: 'They pool optic flow over the whole eye. The basis of the optomotor reflex.',
    detail:
      'HS cells respond to horizontal rotation and VS cells to vertical rotation. When the world turns, the fly turns with it to stay stable. In ExploreFly, the difference between left and right HS cells is part of the turning signal.',
    match: (n) => /^(HSE|HSN|HSS|H1|H2)$/.test(n.t) || /^VS/.test(n.t),
    genes: [
      { symbol: 'shakB', name: 'shaking-B (innexin)', role: 'Forms the electrical synapses that couple VS cells together.' },
    ],
    refs: ['Hausen 1982', 'Borst & Haag 2002'],
    experiment: {
      text: 'Scroll stripes to the right.',
      stimulus: 'gratingR',
      silence: false,
      expect: 'Right HS cells fire and the fly turns right.',
    },
  },
  {
    id: 'escape',
    title: 'Escape: LC4, LPLC2 and the Giant Fiber',
    area: 'Lobula → brain → VNC',
    summary: 'An object that grows fast triggers an emergency take-off within milliseconds.',
    detail:
      'LC4 detects the speed of expansion and LPLC2 its radial shape. Both converge on the Giant Fiber (DNp01), a giant descending neuron wired by electrical synapse to the jump muscles. It is one of the best understood circuits of the fly brain.',
    match: is('LC4', 'LPLC2', 'DNp01', 'DNp02', 'DNp04', 'DNp11'),
    genes: [
      { symbol: 'shakB', name: 'shaking-B', role: 'Electrical synapse between the Giant Fiber and the jump motor neuron. shakB2 mutants no longer take off.' },
      { symbol: 'Dα7', name: 'Nicotinic receptor α7 subunit', role: 'Required for transmission onto the Giant Fiber.' },
    ],
    refs: ['von Reyn et al. 2014', 'Ache et al. 2019', 'Fayyazuddin et al. 2006'],
    experiment: {
      text: 'Silence LC4, LPLC2 and the Giant Fiber, then show a looming object.',
      stimulus: 'loomL',
      silence: true,
      expect: 'Without these neurons the escape disappears while the rest of the optic lobe still responds.',
    },
  },
  {
    id: 'objects',
    title: 'Small objects: LC10 and LC11',
    area: 'Lobula',
    summary: 'They detect small moving targets, such as another fly.',
    detail:
      'LC11 responds to small moving dots. In males, LC10a tracks the female during courtship. In ExploreFly their drive comes from the strongest local motion energy in the image.',
    match: (n) => /^LC10/.test(n.t) || n.t === 'LC11',
    genes: [],
    refs: ['Keleş & Frye 2017', 'Ribeiro et al. 2018', 'Hindmarsh Sten et al. 2021'],
    experiment: {
      text: 'Move a small target in front of the fly.',
      stimulus: 'target',
      silence: false,
      expect: 'LC10 and LC11 light up without triggering an escape.',
    },
  },
  {
    id: 'steering',
    title: 'Steering: DNa01 and DNa02',
    area: 'Descending neurons',
    summary: 'DNa02 activity on one side predicts a turn to that side.',
    detail:
      'Descending neurons connect the brain to the ventral nerve cord (VNC). Recorded during walking, DNa01 and DNa02 predict the direction and speed of turns. ExploreFly reads them to decide where the fly wants to go.',
    match: is('DNa01', 'DNa02'),
    genes: [],
    refs: ['Rayshubskiy et al. 2020', 'Yang et al. 2024'],
  },
  {
    id: 'walking',
    title: 'Walking: P9 and Moonwalker',
    area: 'Descending neurons',
    summary: 'DNp09 (P9) starts forward walking; MDN, the "moonwalker", makes the fly back up.',
    detail:
      'Optogenetic activation of MDN is enough to make a fly walk backwards. P9 instead triggers forward walking and turning towards an object.',
    match: is('DNp09', 'MDN'),
    genes: [],
    refs: ['Bidaye et al. 2014', 'Bidaye et al. 2020'],
  },
  {
    id: 'olfaction',
    title: 'Smell: antenna → antennal lobe',
    area: 'Central brain',
    summary: 'About 50 types of olfactory neurons, one per glomerulus, pass odours on to projection neurons.',
    detail:
      'Each olfactory neuron expresses one receptor and sends its axon to one glomerulus. Projection neurons then relay the odour to the mushroom bodies (learning) and the lateral horn (innate responses).',
    match: (n) => /^ORN_/.test(n.t) || /_(l|ad|v|il|m)?PN$/.test(n.t),
    genes: [
      { symbol: 'Orco', name: 'Odorant receptor co-receptor', role: 'Obligate partner of Or receptors. Without Orco most odours go unnoticed.' },
      { symbol: 'Or42b', name: 'Odorant receptor 42b', role: 'DM1 glomerulus, tuned to vinegar and fruit esters.' },
      { symbol: 'Or67d', name: 'Odorant receptor 67d', role: 'Detects the male pheromone cVA (DA1 glomerulus).' },
      { symbol: 'Gr21a / Gr63a', name: 'CO₂ receptors', role: 'V glomerulus: CO₂ is an alarm signal that drives avoidance.' },
      { symbol: 'Ir84a', name: 'Ionotropic receptor 84a', role: 'Detects food odours that promote courtship.' },
    ],
    refs: ['Vosshall & Stocker 2007', 'Schlegel et al. 2021'],
    experiment: {
      text: 'Send a puff of vinegar odour.',
      stimulus: 'vinegar',
      silence: false,
      expect: 'Olfactory neurons DM1–DM4, then their projection neurons, become active.',
    },
  },
  {
    id: 'mushroom',
    title: 'Mushroom bodies',
    area: 'Central brain',
    summary: 'The centre of olfactory learning and memory: about 2,000 Kenyon cells per side.',
    detail:
      'Each odour activates a small subset of Kenyon cells (sparse coding). Dopaminergic neurons (PAM, PPL1) signal reward or punishment and change the synapses onto output neurons (MBONs), which steer behaviour.',
    match: (n) => /^KC/.test(n.t) || /^MBON/.test(n.t) || /^PAM\d/.test(n.t) || /^PPL1/.test(n.t),
    genes: [
      { symbol: 'rut', name: 'rutabaga (adenylyl cyclase)', role: 'Detects the coincidence of odour and reinforcement. rut mutants learn very poorly.' },
      { symbol: 'dnc', name: 'dunce (phosphodiesterase)', role: 'The first memory gene identified in flies (1976).' },
      { symbol: 'Dop1R1', name: 'Dopamine D1 receptor', role: 'Expressed in Kenyon cells and required for learning.' },
      { symbol: 'ey', name: 'eyeless', role: 'Transcription factor that marks Kenyon cells.' },
      { symbol: 'orb2', name: 'oo18 RNA-binding 2', role: 'Prion-like protein needed for long-term memory.' },
    ],
    refs: ['Heisenberg 2003', 'Aso et al. 2014', 'Li et al. 2020'],
  },
  {
    id: 'lateral-horn',
    title: 'Lateral horn',
    area: 'Central brain',
    summary: 'Innate responses to odours: attraction or aversion, without learning.',
    detail: 'It receives the same projection neurons as the mushroom bodies, but wired in a stereotyped way from one fly to the next.',
    match: re(/^LH(AV|PV|AD|PD|CENT|LV|MB)/),
    genes: [],
    refs: ['Frechter et al. 2019', 'Dolan et al. 2019'],
  },
  {
    id: 'central-complex',
    title: 'Central complex: the compass',
    area: 'Central brain',
    summary: 'A ring of neurons (EPG) encodes head direction, like a compass needle.',
    detail:
      'A bump of activity moves around the ellipsoid body as the fly turns: a ring attractor, first seen directly by Seelig and Jayaraman in 2015. PEN cells shift the bump, Delta7 keeps it in shape and PFL3 compares the goal heading with the current one to steer.',
    match: (n) => /^(EPG|EPGt|PEG|PEN_a\(PEN1\)|PEN_b\(PEN2\)|Delta7|PFL1|PFL2|PFL3|hDeltaB|ER\d)/.test(n.t),
    genes: [
      { symbol: 'ebo', name: 'ellipsoid body open', role: 'Mutant in which the ellipsoid body ring is open. Walking becomes disoriented.' },
      { symbol: 'nob', name: 'no bridge', role: 'Mutant in which the protocerebral bridge is split.' },
    ],
    refs: ['Seelig & Jayaraman 2015', 'Hulse et al. 2021', 'Westeinde et al. 2024'],
  },
  {
    id: 'courtship',
    title: 'Courtship (fru / dsx)',
    area: 'Whole CNS',
    summary: 'This connectome is a male. Neurons labelled fruitless or doublesex wire his courtship.',
    detail:
      'Male splicing of fruitless (FruM) and doublesex specifies about 2,000 dimorphic neurons. P1 neurons integrate cues from the female and trigger courtship; pIP10 and DNp13 drive wing song. In ExploreFly this card gathers every type annotated fru/dsx in MaleCNS.',
    match: (n) => !!n.fru,
    genes: [
      { symbol: 'fru', name: 'fruitless', role: 'Its male isoform FruM is necessary and sufficient to wire courtship.' },
      { symbol: 'dsx', name: 'doublesex', role: 'Sex-specific transcription factor that shapes P1 and pC1 neurons.' },
      { symbol: 'ppk23 / ppk25', name: 'pickpocket 23 and 25', role: 'Leg channels that sense contact pheromones (annotated in MaleCNS).' },
      { symbol: 'Or67d', name: 'cVA receptor', role: 'cVA from another male suppresses courtship and promotes aggression.' },
    ],
    refs: ['Ryner et al. 1996', 'Kimura et al. 2008', 'Auer & Benton 2016'],
    experiment: {
      text: 'Present the cVA pheromone.',
      stimulus: 'cva',
      silence: false,
      expect: 'DA1 olfactory neurons (fru+), then their dimorphic relays, become active.',
    },
  },
  {
    id: 'clock',
    title: 'Circadian clock',
    area: 'Central brain',
    summary: 'About 150 clock neurons pace activity over 24 hours.',
    detail:
      'Small LNv cells release the neuropeptide PDF in the morning and synchronise the other groups (LNd, DN1–DN3). The clock genes were discovered in Drosophila, earning Hall, Rosbash and Young the 2017 Nobel Prize.',
    match: (n) => /^(s-LNv|l-LNv|5th-LNv|LNd|DN1|DN2|DN3|LPN)/.test(n.t),
    genes: [
      { symbol: 'per', name: 'period', role: 'The first clock gene ever identified (Konopka & Benzer, 1971).' },
      { symbol: 'tim', name: 'timeless', role: 'Partner of PER. TIM is degraded by light.' },
      { symbol: 'Clk / cyc', name: 'Clock and cycle', role: 'Drive per and tim transcription: the core feedback loop.' },
      { symbol: 'Pdf', name: 'Pigment-dispersing factor', role: 'LNv neuropeptide that synchronises the network.' },
      { symbol: 'cry', name: 'cryptochrome', role: 'Internal blue-light sensor that resets the clock.' },
    ],
    refs: ['Konopka & Benzer 1971', 'Hardin 2011', 'Reinhard et al. 2024'],
  },
  {
    id: 'neuroendocrine',
    title: 'Neurosecretion',
    area: 'Pars intercerebralis',
    summary: 'These cells release hormones, including the fly equivalent of insulin.',
    detail: 'IPCs secrete insulin-like peptides depending on nutritional state. DH44 neurons sense nutritive sugars and tune food intake.',
    match: (n) => /^(IPC|DH44|DSKMP)/.test(n.t) || /endocrine/.test(n.sc),
    genes: [
      { symbol: 'Ilp2', name: 'Insulin-like peptide 2', role: 'Insulin-like hormone made by the IPCs.' },
      { symbol: 'Dh44', name: 'Diuretic hormone 44', role: 'Homologue of mammalian CRH; involved in nutrient choice.' },
    ],
    refs: ['Nässel & Zandawala 2019', 'Dus et al. 2015'],
  },
  {
    id: 'taste',
    title: 'Taste',
    area: 'Labellum and pharynx',
    summary: 'Gustatory neurons of the proboscis tell sweet, bitter, water and salt apart.',
    detail: 'Their axons enter the subesophageal zone (SEZ), where relays have been traced all the way to the proboscis motor neurons.',
    match: (n) => n.c === 'gustatory',
    genes: [
      { symbol: 'Gr5a / Gr64', name: 'Sweet receptors', role: 'Neurons that express them trigger proboscis extension.' },
      { symbol: 'Gr66a', name: 'Bitter receptor', role: 'Its neurons make the fly reject food.' },
      { symbol: 'ppk28', name: 'pickpocket 28', role: 'Detects water.' },
    ],
    refs: ['Scott 2018', 'Shiu et al. 2024'],
    experiment: {
      text: 'Stimulate the gustatory neurons of the labellum.',
      stimulus: 'sugar',
      silence: false,
      expect: 'SEZ relays become active.',
    },
  },
  {
    id: 'mechano',
    title: 'Touch and hearing',
    area: 'Legs, antennae, wings',
    summary: 'Tactile bristles, chordotonal organs and the Johnston organ (the fly ear).',
    detail: 'Johnston organ (JO) neurons measure antenna vibrations: courtship song, gravity, wind.',
    match: (n) => /mechanosensory/.test(n.c ?? '') || /^JO-/.test(n.t),
    genes: [
      { symbol: 'nompC', name: 'no mechanoreceptor potential C', role: 'Mechanosensitive TRP channel of the bristles.' },
      { symbol: 'iav / nan', name: 'inactive and nanchung', role: 'TRPV channels of chordotonal organs, needed for hearing.' },
      { symbol: 'Piezo', name: 'Piezo', role: 'Mechanosensitive channel, notably for mechanical nociception.' },
    ],
    refs: ['Kamikouchi et al. 2009', 'Tuthill & Wilson 2016'],
    experiment: {
      text: 'Touch the legs.',
      stimulus: 'touch',
      silence: false,
      expect: 'Tactile neurons of the VNC and their interneurons respond.',
    },
  },
  {
    id: 'motor',
    title: 'Motor neurons',
    area: 'Ventral nerve cord (VNC)',
    summary: 'The final output: about 700 motor neurons drive the legs, wings, neck and proboscis.',
    detail: 'MaleCNS includes the whole VNC, so a signal can be followed from the eye to the muscle, something a brain-only dataset like FlyWire cannot do.',
    match: (n) => /motor/.test(n.sc),
    genes: [],
    refs: ['Cheong et al. 2024', 'Takemura et al. 2024'],
  },
];

export interface GeneEntry extends Gene {
  systems: System[];
}

export function geneIndex(): GeneEntry[] {
  const map = new Map<string, GeneEntry>();
  for (const s of SYSTEMS) {
    for (const g of s.genes) {
      const e = map.get(g.symbol);
      if (e) e.systems.push(s);
      else map.set(g.symbol, { ...g, systems: [s] });
    }
  }
  return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function systemNodes(c: Connectome, s: System): number[] {
  const out: number[] = [];
  c.nodes.forEach((n, i) => {
    if (s.match(n)) out.push(i);
  });
  return out;
}
