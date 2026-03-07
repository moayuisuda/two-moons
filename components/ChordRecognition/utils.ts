import { ChordSegment } from "./api";

export const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }
  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
};

export const getActiveChordIndex = (
  currentTime: number,
  segments: ChordSegment[]
) => {
  if (!segments.length) {
    return -1;
  }

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (currentTime >= segments[index].start) {
      return index;
    }
  }
  return -1;
};

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

export const estimateBeatSeconds = (segments: ChordSegment[]) => {
  const durations = segments
    .map((segment) =>
      segment.label !== "N" ? Math.max(0.05, segment.end - segment.start) : 0
    )
    .filter((duration) => Number.isFinite(duration) && duration > 0);

  if (!durations.length) {
    return 0.5;
  }

  const candidates: number[] = [];
  for (let candidate = 0.2; candidate <= 1.2; candidate += 0.02) {
    candidates.push(Number(candidate.toFixed(2)));
  }

  let bestCandidate = 0.5;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    let score = 0;
    for (const duration of durations) {
      const ratio = duration / candidate;
      const nearest = Math.max(1, Math.round(ratio));
      score += Math.abs(ratio - nearest);
    }

    if (score < bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
};

export const getSegmentBeatSpan = (
  segment: ChordSegment,
  beatSeconds: number
) => {
  const duration = Math.max(0.05, segment.end - segment.start);
  const beats = Math.round(duration / Math.max(0.1, beatSeconds));
  return clamp(beats, 1, 16);
};
