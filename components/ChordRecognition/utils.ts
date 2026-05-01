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
  segments: ChordSegment[],
  options?: {
    preHighlightMs?: number;
  }
) => {
  if (!segments.length) {
    return -1;
  }

  const preHighlightSeconds = Math.max(
    0,
    (options?.preHighlightMs ?? 0) / 1000
  );

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (currentTime >= segments[index].start - preHighlightSeconds) {
      return index;
    }
  }
  return -1;
};
