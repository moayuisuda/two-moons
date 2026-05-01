import type { ChordSegment } from "../api";
import {
  debugChordNaming,
  parseChordRoot,
  keyTransitionLogProb,
  chordTransitionLogProb,
} from "./hmm-params";
import {
  getStandardScaleName,
  renameChord,
  standardMajorScaleNames,
  standardMinorScaleNames,
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

const scaleCandidates = [
  ...standardMajorScaleNames,
  ...standardMinorScaleNames.map((x) => `${x}:minor`),
];

function checkProb(prob: number, ...args: any[]) {
  if (isNaN(prob) || prob > 0) {
    console.error(`Invalid probability: ${prob}`, ...args);
    return 0;
  }
  return prob;
}

function decodeHmm(chords: ChordSegment[]) {
  const length = chords.length;
  if (length === 0) {
    return [];
  }

  // hidden states: 12 major keys, concatenated with 12 minor keys
  const dp = Array.from({ length }, () => Array(24).fill(0));
  const pre = Array.from({ length }, () => Array(24).fill(-1));

  const empty = Array<number>(24).fill(0);

  const averageDuration =
    chords.reduce((acc, cur) => acc + cur.end - cur.start, 0) / length;

  let lastChord: string | null = null;
  for (let i = 0; i < length; i += 1) {
    const chord = chords[i].label;
    const duration = chords[i].end - chords[i].start;
    const lastKeyLogProbs = i > 0 ? dp[i - 1] : empty;
    for (let currentKeyIndex = 0; currentKeyIndex < 24; currentKeyIndex += 1) {
      const currentKey = scaleCandidates[currentKeyIndex];

      // transition scores
      const keyTransitions = empty.map(
        (_, key) =>
          lastKeyLogProbs[key] +
          checkProb(
            keyTransitionLogProb(scaleCandidates[key], currentKey),
            i,
            currentKey
          )
      );
      const lastKey = argMax(keyTransitions);

      // emission scores
      const chordTransition = checkProb(
        chordTransitionLogProb(currentKey, lastChord, chord),
        i,
        currentKey,
        lastChord,
        chord
      );

      // if chord duration is very long, repeat chord transition is more likely
      const repeatChord =
        duration < averageDuration * 1.7
          ? 0
          : checkProb(
              chordTransitionLogProb(currentKey, chord, chord),
              i,
              currentKey,
              chord
            );

      // total score
      const score = keyTransitions[lastKey] + chordTransition + repeatChord;

      dp[i][currentKeyIndex] = score;
      pre[i][currentKeyIndex] = lastKey;
    }

    // const maxScores = dp[i]
    //   .map((score, idx) => ({ key: scaleCandidates[idx], score }))
    //   .sort((a, b) => b.score - a.score)
    //   .slice(0, 5)
    // console.log(
    //   `${chords[i].start.toFixed(2)}: \n` +
    //   maxScores
    //     .map(x => `${x.key} (${debugChordNaming(lastChord, x.key)} -> ${debugChordNaming(chord, x.key)}): ${x.score.toFixed(2)}`)
    //     .join("\n")
    // )

    if (parseChordRoot(chord) !== null || duration >= averageDuration * 1.7) {
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

  return keySequence.map((key) => scaleCandidates[key]);
}

export interface EstimatedChordSegment extends ChordSegment {
  key: string;
  originalLabel: string;
}

export function estimateKey(chords: ChordSegment[]) {
  const keySequence = decodeHmm(chords);

  return chords.map<EstimatedChordSegment>((chord, index) => {
    return {
      ...chord,
      label: renameChord(chord.label, keySequence[index]),
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
