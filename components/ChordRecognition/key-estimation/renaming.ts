// TODO: use global types
export interface Chord {
  root: number;
  type: string;
}

type AccidentalPreference = "sharp" | "flat" | "neutral";

const sharpScaleNames = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const flatScaleNames = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

const standardMajorScaleNames = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

const standardMinorScaleNames = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "Bb",
  "B",
];

const rootToLevelMap = Object.fromEntries([
  ...sharpScaleNames.map((root, index) => [root, index]),
  ...flatScaleNames.map((root, index) => [root, index]),
]);

export function parseChord(label: string): Chord {
  if (label === "N") {
    return {
      root: -1,
      type: "N",
    };
  }
  const [root, type] = label.split(":");
  const rootLevel = rootToLevelMap[root];
  if (rootLevel === undefined) {
    console.warn("Unexpected chord root: ", root);
    return {
      root: -1,
      type: "N",
    };
  }
  return {
    root: rootLevel,
    type: type?.replace(/\/.+$/, "") || "",
  };
}

function keyAccidentalPreference(key: number): AccidentalPreference {
  const isMajor = key < 12;
  const keyRoot = key % 12;
  if (isMajor) {
    if ([2, 4, 6, 7, 9, 11].includes(keyRoot)) return "sharp";
    if ([1, 3, 5, 8, 10].includes(keyRoot)) return "flat";
    return "neutral";
  } else {
    // minor key
    if ([1, 4, 6, 8, 11].includes(keyRoot)) return "sharp";
    if ([0, 2, 3, 5, 7, 10].includes(keyRoot)) return "flat";
    return "neutral";
  }
}

function deltaAccidentalPreference(
  deltaKey: number,
  isMajor: boolean
): AccidentalPreference {
  if (isMajor) {
    // Prefer functional spellings in major:
    // b2, b3, b6, b7 => flats; #4 => sharp.
    if ([1, 3, 8, 10].includes(deltaKey)) return "flat";
    if (deltaKey === 6) return "sharp";
    return "neutral";
  }

  // Prefer functional spellings in minor:
  // b2, b6 => flats; #3, #4, leading tone(7) => sharps.
  if ([1, 8].includes(deltaKey)) return "flat";
  if ([4, 6, 11].includes(deltaKey)) return "sharp";
  return "neutral";
}

function chooseScaleName(
  root: number,
  preference: AccidentalPreference,
  isMajor: boolean
) {
  if (preference === "sharp") return sharpScaleNames[root];
  if (preference === "flat") return flatScaleNames[root];
  return isMajor
    ? standardMajorScaleNames[root]
    : standardMinorScaleNames[root];
}

/**
 * C major => 0, C# major => 1, ...
 * C minor => 12, C# minor => 13, ...
 */
export function getStandardScaleName(key: number) {
  const isMajor = key < 12;
  const preference = keyAccidentalPreference(key);
  return (
    chooseScaleName(key % 12, preference, isMajor) +
    (isMajor ? " major" : " minor")
  );
}

export function renameChord(label: string, chord: Chord, key: number) {
  if (chord.root < 0) return label;

  const colonPos = label.indexOf(":");
  if (colonPos < 0) return label;

  const suffix = label.slice(colonPos + 1);
  const isMajor = key < 12;
  const deltaKey = (chord.root - key + 24) % 12;

  const keyPreference = keyAccidentalPreference(key);
  const intervalPreference = deltaAccidentalPreference(deltaKey, isMajor);
  const preference =
    intervalPreference === "neutral" ? keyPreference : intervalPreference;

  const rootName = chooseScaleName(chord.root, preference, isMajor);
  return `${rootName}:${suffix}`;
}
