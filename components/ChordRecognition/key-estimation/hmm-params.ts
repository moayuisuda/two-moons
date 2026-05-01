import key_hmm_params_raw from "./key_hmm_params_raw.json";

function softClamp(numbers: number[], min: number, max: number, scale = 0) {
  return numbers.map((num) =>
    num > max
      ? max + (num - max) * scale
      : num < min
        ? min + (num - min) * scale
        : num
  );
}

// will cast 0s to targetMinimum
function normalizeLogProb(
  scores: number[],
  temperature: number,
  targetMinimum: number
) {
  const maxScore = scores.reduce((a, b) => (a > b ? a : b), -Infinity);
  const expScores = scores.map((score) =>
    Math.exp((score - maxScore) / temperature)
  );
  const sumExpScores = expScores.reduce((a, b) => a + b, 0);
  const scale =
    targetMinimum / Math.log(Math.exp(-maxScore / temperature) / sumExpScores);
  return expScores.map((score) => Math.log(score / sumExpScores) * scale);
}

/**
 * [maj(0)/min(1)][delta_key(0~12) + mode_offset(maj:0/min:12)]
 */
const stateTransitionProb = key_hmm_params_raw.state_transition_counts.map(
  // normalized to ~ [0 (keep) ~ -80 (small jump) ~ -120 (large jump)]
  (mode_counts, i) => normalizeLogProb(softClamp(mode_counts, 0, 160), 1, -120)
);

// console.log(stateTransitionProb)

/**
 * [maj(0)/min(1)][from_chord_label * 48 + to_chord_label], chord_label = relative_root(0~11) * 4 + type_offset(maj:0/min:1/dom:2/dim:3)
 */
const emissionProb = key_hmm_params_raw.emission_counts.map(
  // normalized to ~ [-10 (tonic) ~  -50 (rare chords)]
  (mode_counts, i) =>
    normalizeLogProb(
      i === 0
        ? softClamp(mode_counts.flat(), 0, 400, 0.01)
        : softClamp(mode_counts.flat(), 0, 400, 0.01),
      i === 0 ? 20 : 30,
      -50
    )
);

// console.log(emissionProb.map(x => x.slice().sort((a, b) => b - a).slice(0, 20)))

const PITCH_TO_INT = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  "E#": 5,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

const ROOT_RE = /^([A-G](?:#|b)?)/;

// 4 - way taxonomy: 0: maj, 1: min, 2: dom, 3: dim
const CHORD_TYPE_BY_SUFFIX = {
  // BASIC_TYPES
  ".": 0,
  maj: 0,
  min: 1,
  sus4: 0,
  sus2: 0,
  dim: 3,
  aug: 0,
  "5": 0,
  "1": 0,
  // EXTENDED_TYPES
  maj6: 0,
  min6: 1,
  "7": 2,
  maj7: 0,
  min7: 1,
  minmaj7: 1,
  dim7: 3,
  hdim7: 3,
  "9": 2,
  maj9: 0,
  min9: 1,
  "11": 2,
  min11: 1,
  "13": 2,
  maj13: 0,
  min13: 1,
  "": 0,
};

export function parseKey(key: string): [key: number, isMinor: boolean] {
  if (key.includes(":")) {
    const [tonic, mode] = key.split(":", 2);
    const isMinor = mode.trim().toLowerCase() === "minor";
    return [
      PITCH_TO_INT[tonic.trim() as keyof typeof PITCH_TO_INT] ?? -1,
      isMinor,
    ];
  } else {
    const tonic = key.trim();
    return [PITCH_TO_INT[tonic as keyof typeof PITCH_TO_INT] ?? -1, false];
  }
}

function keyTransitionBucket(curKey: string, nxtKey: string): number {
  const [curTonic] = parseKey(curKey);
  const [nxtTonic, nxtIsMinor] = parseKey(nxtKey);
  const delta = (nxtTonic - curTonic + 12) % 12;
  return delta + (nxtIsMinor ? 12 : 0);
}

export function parseChordRoot(chordName: string): number | null {
  if (!chordName || chordName === "N" || chordName === "X") {
    return null;
  }

  const head = chordName.split("/", 1)[0].trim();
  const m = head.match(ROOT_RE);
  if (!m) {
    return null;
  }

  const root = m[1];
  return PITCH_TO_INT[root as keyof typeof PITCH_TO_INT] ?? null;
}

function classifyChordType(chordName: string): number | null {
  if (!chordName || chordName === "N" || chordName === "X") {
    return null;
  }

  const head = chordName.split("/", 1)[0].trim();
  let quality = "";
  if (head.includes(":")) {
    quality = head.split(":", 2)[1];
  }

  let q = quality.toLowerCase().trim();

  // Remove all decorations and keep the core suffix.
  if (q.includes("(")) {
    q = q.split("(", 1)[0].trim();
  }

  // Prefer explicit mapping for all BASIC/EXTENDED suffixes.
  if (q in CHORD_TYPE_BY_SUFFIX) {
    return CHORD_TYPE_BY_SUFFIX[q as keyof typeof CHORD_TYPE_BY_SUFFIX];
  }

  // Unknown suffix fallback: treat as major.
  return 0;
}

function chordSymbolInKey(chordName: string, key: string): number | null {
  const root = parseChordRoot(chordName);
  if (root === null) {
    return null;
  }

  const chordType = classifyChordType(chordName);
  if (chordType === null) {
    return null;
  }

  const [tonic] = parseKey(key);
  const relPc = (root - tonic + 12) % 12;
  return relPc * 4 + chordType;
}

const deltaDebugNames = [
  "1",
  "b2",
  "2",
  "b3",
  "3",
  "4",
  "b5",
  "5",
  "b6",
  "6",
  "b7",
  "7",
];

export function debugChordNaming(
  chordName: string | null | undefined,
  key: string
) {
  if (chordName === null || chordName === undefined) {
    return "N";
  }
  const root = parseChordRoot(chordName);
  if (root === null) {
    return "N";
  }
  const [keyRoot] = parseKey(key);
  const delta = (root - keyRoot + 12) % 12;
  const [, chordType] = chordName.split(":", 2);
  return deltaDebugNames[delta] + ":" + chordType;
}

export function keyTransitionLogProb(curKey: string, nxtKey: string): number {
  const [, isMinor] = parseKey(curKey);
  const bucket = keyTransitionBucket(curKey, nxtKey);
  return stateTransitionProb[isMinor ? 1 : 0][bucket];
}

export function chordTransitionLogProb(
  curKey: string,
  lastChord: string | undefined | null,
  nextChord: string
): number {
  if (lastChord === null || lastChord === undefined) {
    return -1;
  }

  const [, isMinor] = parseKey(curKey);
  const lastChordSymbol = chordSymbolInKey(lastChord, curKey);
  const nextChordSymbol = chordSymbolInKey(nextChord, curKey);
  if (lastChordSymbol === null || nextChordSymbol === null) {
    return -1;
  }

  return emissionProb[isMinor ? 1 : 0][lastChordSymbol * 48 + nextChordSymbol];
}
