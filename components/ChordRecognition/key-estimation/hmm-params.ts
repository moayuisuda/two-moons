import { type Chord } from "./renaming";

export const DEBUG_HMM_PARAMS = false; // import.meta.env.DEV

/*
Raw key transition correlation matrix from the paper.

See https://ismir2006.ismir.net/PAPERS/ISMIR0691_Paper.pdf
*/

const rawKeyTransitionCorrelation = {
  maj: {
    maj: [
      1.0, 0.5, 0.04, 0.105, 0.185, 0.591, 0.683, 0.591, 0.185, 0.105, 0.04,
      0.5,
    ],
    min: [
      0.511, 0.298, 0.237, 0.654, 0.536, 0.215, 0.369, 0.241, 0.508, 0.651,
      0.402, 0.158,
    ],
  },
  min: {
    maj: [
      0.511, 0.158, 0.402, 0.651, 0.508, 0.241, 0.369, 0.215, 0.536, 0.654,
      0.237, 0.298,
    ],
    min: [
      1.0, 0.394, 0.16, 0.055, 0.003, 0.339, 0.673, 0.339, 0.003, 0.055, 0.16,
      0.394,
    ],
  },
};

const NINF = -1000; // small enough to be ignored
const NTRANS = 3.5; // non diatonic chord transitions score

/*
Raw chord transition ratings from the paper.

The score is between 1 and 7
*/
const rawChordTransitionRatings = [
  [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], // N
  [NTRANS, NINF, 5.1, 4.78, 5.91, 5.94, 5.26, 4.57], // I
  [NTRANS, 5.69, NINF, 4.0, 4.76, 6.1, 4.97, 5.41], // ii
  [NTRANS, 5.38, 4.47, NINF, 4.63, 5.03, 4.6, 4.47], // iii
  [NTRANS, 5.94, 5.0, 4.22, NINF, 6.0, 4.35, 4.79], // IV
  [NTRANS, 6.19, 4.79, 4.47, 5.51, NINF, 5.19, 4.85], // V
  [NTRANS, 5.04, 5.44, 4.72, 5.07, 5.56, NINF, 4.5], // vi
  [NTRANS, 5.85, 4.16, 4.16, 4.53, 5.16, 4.19, NINF], // vii
];

/*
Raw chord staying ratings from the paper.

The score is between 1 and 7
*/

const rawChordStayingRatings = {
  maj: {
    maj: [
      6.66, 4.71, 4.6, 4.31, 4.64, 5.59, 4.36, 5.33, 5.01, 4.64, 4.73, 4.67,
    ],
    min: [
      3.75, 2.59, 3.12, 2.18, 2.76, 3.19, 2.13, 2.68, 2.61, 3.62, 2.56, 2.76,
    ],
    dim: [
      3.27, 2.7, 2.59, 2.79, 2.64, 2.54, 3.25, 2.58, 2.36, 3.35, 2.38, 2.64,
    ],
  },
  min: {
    maj: [
      5.3, 4.11, 3.83, 4.14, 3.99, 4.41, 3.92, 4.38, 4.45, 3.69, 4.22, 3.85,
    ],
    min: [5.9, 3.08, 3.25, 3.5, 3.33, 4.6, 2.98, 3.48, 3.53, 3.78, 3.13, 3.14],
    dim: [3.93, 2.84, 3.43, 3.42, 3.51, 3.41, 3.91, 3.16, 3.17, 4.1, 3.1, 3.18],
  },
};

/*
Normalize log probabilities.
*/

function normalizeLogProb(
  scores: number[],
  temperature: number,
  scale: number = 1
) {
  const maxScore = Math.max(...scores);
  const expScores = scores.map((score) =>
    Math.exp((score - maxScore) / temperature)
  );
  const sumExpScores = expScores.reduce((a, b) => a + b, 0);
  return expScores.map((score) => Math.log(score / sumExpScores) * scale);
}

// only allows transition when significantly different from the previous key
const transitionTemperature = 1 / 50;
const transitionProbFactor = 3;

const normalizedKeyTransitionLogProbs = {
  maj: normalizeLogProb(
    [
      ...rawKeyTransitionCorrelation.maj.maj,
      ...rawKeyTransitionCorrelation.maj.min,
    ],
    transitionTemperature,
    transitionProbFactor
  ),
  min: normalizeLogProb(
    [
      ...rawKeyTransitionCorrelation.min.maj,
      ...rawKeyTransitionCorrelation.min.min,
    ],
    transitionTemperature,
    transitionProbFactor
  ),
};

if (DEBUG_HMM_PARAMS) console.log(normalizedKeyTransitionLogProbs);

/**
 * C major => 0, C# major => 1, ...
 * C minor => 12, C# minor => 13, ...
 */
export function keyTransitionLogProb(keyFrom: number, keyTo: number) {
  const isMajorFrom = keyFrom < 12;
  const isMajorTo = keyTo < 12;
  const deltaKey = (keyTo - keyFrom + 24) % 12;
  if (isMajorFrom && isMajorTo) {
    // from major to major
    return normalizedKeyTransitionLogProbs.maj[deltaKey] * transitionProbFactor;
  } else if (isMajorFrom) {
    // from major to minor
    return (
      normalizedKeyTransitionLogProbs.maj[deltaKey + 12] * transitionProbFactor
    );
  } else if (isMajorTo) {
    // from minor to major
    return normalizedKeyTransitionLogProbs.min[deltaKey] * transitionProbFactor;
  } else {
    // from minor to minor
    return (
      normalizedKeyTransitionLogProbs.min[deltaKey + 12] * transitionProbFactor
    );
  }
}

const chordTransitionTemperature = 1 / 7;
const chordTransitionProbFactor = 2;

const normalizedChordTransitionLogProbs = normalizeLogProb(
  rawChordTransitionRatings.flat(),
  chordTransitionTemperature,
  chordTransitionProbFactor
).flatMap((_, index, array) => {
  if (index % 8 === 0) return [array.slice(index, index + 8)];
  return [];
});

if (DEBUG_HMM_PARAMS) console.log(normalizedChordTransitionLogProbs);

export const majorTonality = [
  1, // I
  0,
  2, // ii
  0,
  3, // iii
  4, // IV
  0,
  5, // V
  0,
  6, // vi
  0,
  7, // vii
];

export const minorTonality = [
  1, // i
  0,
  2, // ii(dim)
  3, // bIII
  0,
  4, // iv
  0,
  5, // v or V
  6, // bVI
  0,
  7, // bVII
  0,
];

export function chordRootTonality(key: number, chord: Chord) {
  const isMajor = key < 12;
  const deltaKey = (chord.root - key + 24) % 12;
  return isMajor ? majorTonality[deltaKey] : minorTonality[deltaKey];
}

/**
 * C major => 0, C# major => 1, ...
 * C minor => 12, C# minor => 13, ...
 */
export function chordTransitionLogProb(
  key: number,
  chordFrom: Chord | null,
  chordTo: Chord
) {
  if (!chordFrom || chordFrom.root < 0 || chordTo.root < 0) return 0;

  const tonalityFrom = chordRootTonality(key, chordFrom);
  const tonalityTo = chordRootTonality(key, chordTo);
  if (tonalityFrom === tonalityTo) {
    if (tonalityFrom === 0) {
      // non diatonic chord transition, less probability
      return normalizedChordTransitionLogProbs[0][0] * 2;
    }
    // the chords have the same root, no transition occurred
    return 0;
  }

  return normalizedChordTransitionLogProbs[tonalityFrom][tonalityTo];
}

const chordStayingTemperature = 1 / 7;
const chordStayingProbFactor = 1;
const tonalChordStayingFactor = 2;

const tonalChordStayingRatings = {
  maj: {
    maj: [2, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0],
    min: [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    dim: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  },
  min: {
    maj: [0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0],
    min: [2, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0],
    dim: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};

const normalizedChordStayingLogProbs = {
  maj: normalizeLogProb(
    [
      ...rawChordStayingRatings.maj.maj.map(
        (score, index) =>
          score +
          tonalChordStayingRatings.maj.maj[index] * tonalChordStayingFactor
      ),
      ...rawChordStayingRatings.maj.min.map(
        (score, index) =>
          score +
          tonalChordStayingRatings.maj.min[index] * tonalChordStayingFactor
      ),
      ...rawChordStayingRatings.maj.dim.map(
        (score, index) =>
          score +
          tonalChordStayingRatings.maj.dim[index] * tonalChordStayingFactor
      ),
    ],
    chordStayingTemperature,
    chordStayingProbFactor
  ),
  min: normalizeLogProb(
    [
      ...rawChordStayingRatings.min.maj.map(
        (score, index) =>
          score +
          tonalChordStayingRatings.min.maj[index] * tonalChordStayingFactor
      ),
      ...rawChordStayingRatings.min.min.map(
        (score, index) =>
          score +
          tonalChordStayingRatings.min.min[index] * tonalChordStayingFactor
      ),
      ...rawChordStayingRatings.min.dim.map(
        (score, index) =>
          score +
          tonalChordStayingRatings.min.dim[index] * tonalChordStayingFactor
      ),
    ],
    chordStayingTemperature,
    chordStayingProbFactor
  ),
};

if (DEBUG_HMM_PARAMS) console.log(normalizedChordStayingLogProbs);

function chordTypeOffset(chord: Chord) {
  if (chord.type.includes("min"))
    // min, minmaj7, min7, min9, etc
    return 12;
  if (chord.type.includes("maj") || chord.type.includes("sus"))
    // maj, maj7, sus4, etc
    return 0;
  if (chord.type.includes("dim") || chord.type.includes("aug"))
    // dim, dim7, hdim7, aug, etc
    return 24;
  // 7, 9, 11, etc
  return 0;
}

/**
 * C major => 0, C# major => 1, ...
 * C minor => 12, C# minor => 13, ...
 */
export function chordStayingLogProb(key: number, chord: Chord) {
  if (chord.root < 0) return 0;

  const isMajor = key < 12;
  const stayingLogProbs = isMajor
    ? normalizedChordStayingLogProbs.maj
    : normalizedChordStayingLogProbs.min;

  const typeOffset = chordTypeOffset(chord);
  const deltaIndex = (chord.root - key + 24) % 12;

  return stayingLogProbs[deltaIndex + typeOffset];
}

const secondsPerBeat = 0.1;

export function chordDurationTimeFactor(durationSeconds: number) {
  return Math.max(durationSeconds - secondsPerBeat, secondsPerBeat);
}
