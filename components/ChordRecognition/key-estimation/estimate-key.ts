import type { ChordSegment } from "../api";
import {
  keyTransitionLogProb,
  chordTransitionLogProb,
  chordStayingLogProb,
  chordDurationTimeFactor,
  DEBUG_HMM_PARAMS,
} from "./hmm-params";
import {
  Chord,
  parseChord,
  getStandardScaleName,
  renameChord,
} from "./renaming";

function argMax(scores: number[]) {
  let maxIdx = 0;
  let maxVal = scores[0];
  for (let i = 1; i < scores.length; i += 1) {
    if (scores[i] > maxVal) {
      maxVal = scores[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}

function decodeHmm(
  parsedChords: Chord[],
  chordDuration: number[],
  originalChords: ChordSegment[]
) {
  const length = parsedChords.length;
  if (length === 0) {
    return [];
  }

  // hidden states: 12 major keys, concatenated with 12 minor keys
  const dp = Array.from({ length }, () => Array(24).fill(0));
  const pre = Array.from({ length }, () => Array(24).fill(-1));

  const empty = Array(24).fill(0);

  let lastChord: Chord | null = null;
  for (let i = 0; i < length; i += 1) {
    const chord = parsedChords[i];
    const duration = chordDuration[i];
    const lastKeyLogProbs = i > 0 ? dp[i - 1] : empty;
    for (let currentKey = 0; currentKey < 24; currentKey += 1) {
      // transition scores
      const keyTransitions = empty.map(
        (_, key) => lastKeyLogProbs[key] + keyTransitionLogProb(key, currentKey)
      );
      const lastKey = argMax(keyTransitions);

      // emission scores
      const chordTransition = chordTransitionLogProb(
        currentKey,
        lastChord,
        chord
      );
      const chordStaying = chordStayingLogProb(currentKey, chord);
      const durationFactor = chordDurationTimeFactor(duration);

      // total score
      const score =
        keyTransitions[lastKey] +
        (chordTransition + chordStaying) * durationFactor;

      dp[i][currentKey] = score;
      pre[i][currentKey] = lastKey;
    }

    if (DEBUG_HMM_PARAMS) {
      const scores = dp[i]
        .map((score, key) => ({ score, key }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);
      console.log(
        `i=${i} chord=${originalChords[i].label}\n`,
        scores
          .map(
            ({ key, score }) =>
              `${getStandardScaleName(key)}: ${score.toFixed(2)}  (${relativeLevel(chord.root, key)})`
          )
          .join("\n")
      );
    }

    if (chord.root >= 0 || duration > 1) {
      lastChord = chord;
    }
  }

  let lastKey = argMax(dp[length - 1]);
  const keySequence: number[] = [];
  for (let i = length - 1; i >= 0; i -= 1) {
    keySequence.push(lastKey);
    lastKey = pre[i][lastKey];
  }
  keySequence.reverse();

  return keySequence;
}

const relativeLevels = [
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
function relativeLevel(root: number, key: number) {
  if (root < 0) return "N";
  const delta = (root - key + 24) % 12;
  return relativeLevels[delta];
}

export interface EstimatedChordSegment extends ChordSegment {
  key: string;
  originalLabel: string;
}

export function estimateKey(chords: ChordSegment[]) {
  const parsedChords = chords.map(({ label }) => parseChord(label));
  const chordDuration = chords.map(({ start, end }) => end - start);

  const keySequence = decodeHmm(parsedChords, chordDuration, chords);

  return chords.map<EstimatedChordSegment>((chord, index) => {
    return {
      ...chord,
      label: renameChord(chord.label, parsedChords[index], keySequence[index]),
      key: getStandardScaleName(keySequence[index]),
      originalLabel: chord.label,
    };
  });
}

export interface KeyMarker {
  start: number;
  end: number;
  key: string;
}

export function getKeyMarkers(chords: EstimatedChordSegment[]): KeyMarker[] {
  let lastKey = "",
    lastStart = 0;
  const markers: KeyMarker[] = [];
  for (let i = 0; i < chords.length; i += 1) {
    const chord = chords[i];
    if (chord.key !== lastKey) {
      if (lastKey) {
        markers.push({
          start: lastStart,
          end: chord.start,
          key: lastKey,
        });
      }
      lastKey = chord.key;
      lastStart = chord.start;
    }
  }
  if (lastKey) {
    markers.push({
      start: lastStart,
      end: chords[chords.length - 1].end,
      key: lastKey,
    });
  }
  return markers;
}
