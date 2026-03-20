import { ChordSegment, MeteredBeatEvent } from "./api";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatTime, getActiveChordIndex } from "./utils";
import { Empty } from "antd";

interface ChordSegmentWithKey extends ChordSegment {
  key?: string;
}

interface RecognitionResultProps {
  audioUrl: string;
  segments: ChordSegmentWithKey[];
  beats: MeteredBeatEvent[];
}

interface HalfBeatUnit {
  start: number;
  end: number;
  globalUnit: number;
}

interface BarData {
  index: number;
  meter: number;
  start: number;
  end: number;
  units: HalfBeatUnit[];
}

interface QuantizedChord {
  label: string;
  startUnit: number;
  sourceIndex: number;
  startTime: number;
  nearestBeatUnit: number;
  key?: string;
  showKeyMarker?: boolean;
}

interface BarChordSpan {
  label: string;
  sourceIndex: number;
  startUnitInBar: number;
  spanUnits: number;
  seekTime: number;
  showLabel: boolean;
  key?: string;
  showKeyMarker?: boolean;
}

interface ChordSpanBlockProps {
  chord: BarChordSpan;
  activeChordIndex: number;
  onClick: () => void;
}

function ChordSpanBlock({
  chord,
  activeChordIndex,
  onClick,
}: ChordSpanBlockProps) {
  const isActive = chord.sourceIndex === activeChordIndex;

  return (
    <div
      className={`relative z-10 h-[30px] px-2 rounded-sm border-solid border-0 border-l-2 transition-colors duration-200 cursor-pointer flex items-center overflow-visible whitespace-nowrap ${
        isActive
          ? "bg-sky-100 text-gray-900 border-l-sky-600/40"
          : "bg-gray-100 text-gray-800 border-l-black/40"
      }`}
      style={{
        gridColumn: `${chord.startUnitInBar + 1} / span ${Math.max(1, chord.spanUnits)}`,
      }}
      title={chord.label || "N"}
      onClick={onClick}
    >
      {chord.showLabel && chord.showKeyMarker && chord.key ? (
        <div className="absolute -top-4 left-0 z-20 text-[12px] leading-none text-white bg-black px-1.5 py-[2px] rounded-sm shadow-sm border border-black/80 pointer-events-none whitespace-nowrap">
          {chord.key}
        </div>
      ) : null}
      {chord.showLabel ? (
        <div className="font-semibold text-sm overflow-hidden text-ellipsis">
          {chord.label || "N"}
        </div>
      ) : null}
    </div>
  );
}

interface BarGridLineProps {
  bar: BarData;
  quantizedChords: QuantizedChord[];
  totalUnits: number;
  activeChordIndex: number;
  onSeek: (time: number) => void;
}

function BarGridLine({
  bar,
  quantizedChords,
  totalUnits,
  activeChordIndex,
  onSeek,
}: BarGridLineProps) {
  const unitsInBar = bar.units.length;
  const spans = buildBarChordSpans(bar, quantizedChords, totalUnits);

  return (
    <div className="relative rounded-sm border border-gray-200 bg-white/60 overflow-visible w-full">
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px)",
          backgroundSize: `${100 / unitsInBar}% 100%`,
        }}
      />
      <div
        className="relative z-10 min-h-[34px] p-1 grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${unitsInBar}, minmax(0, 1fr))`,
        }}
      >
        {spans.map((span) => (
          <ChordSpanBlock
            key={`bar-${bar.index}-chord-${span.sourceIndex}-${span.startUnitInBar}`}
            chord={span}
            activeChordIndex={activeChordIndex}
            onClick={() => onSeek(span.seekTime)}
          />
        ))}
      </div>
      <div className="px-2 pb-1 text-[10px] text-gray-400">
        {formatTime(bar.start)}
      </div>
    </div>
  );
}

interface SegmentFallbackListProps {
  segments: ChordSegmentWithKey[];
  activeChordIndex: number;
  onSeek: (time: number) => void;
}

function SegmentFallbackList({
  segments,
  activeChordIndex,
  onSeek,
}: SegmentFallbackListProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {segments.map((segment, index) => {
        const isActive = index === activeChordIndex;
        const previousKey = index > 0 ? segments[index - 1].key : undefined;
        const showKeyMarker = !!segment.key && segment.key !== previousKey;
        return (
          <button
            key={`${segment.start}-${segment.end}-${index}`}
            className={`px-2 py-2 rounded-sm border-l-2 transition-colors duration-200 ${
              isActive
                ? "bg-sky-100 text-gray-900 border-l-sky-600/40"
                : "bg-gray-100 text-gray-800 border-l-black/40"
            }`}
            onClick={() => onSeek(segment.start)}
          >
            {showKeyMarker ? (
              <div className="text-[10px] leading-none text-black/55 text-left mb-[2px]">
                {segment.key}
              </div>
            ) : null}
            <div className="font-semibold text-sm" title={segment.label || "N"}>
              {segment.label || "N"}
            </div>
            <div className="text-[10px] text-gray-400">
              {formatTime(segment.start)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

const inferTailBeatLength = (beats: MeteredBeatEvent[]) => {
  if (beats.length >= 2) {
    return Math.max(
      0.15,
      beats[beats.length - 1].time - beats[beats.length - 2].time
    );
  }
  return 0.5;
};

const buildBars = (rawBeats: MeteredBeatEvent[]) => {
  const beats = [...rawBeats].sort((a, b) => a.time - b.time);
  if (!beats.length) {
    return [] as BarData[];
  }

  const downbeatIndexes = beats
    .map((beat, index) => ({ beat, index }))
    .filter(({ beat }) => beat.isDownbeat || beat.beatInBar === 1)
    .map(({ index }) => index);

  if (!downbeatIndexes.includes(0)) {
    downbeatIndexes.unshift(0);
  }

  const uniqueDownbeats = Array.from(new Set(downbeatIndexes)).sort(
    (a, b) => a - b
  );
  const bars: BarData[] = [];
  let globalUnit = 0;
  const tailBeatLength = inferTailBeatLength(beats);

  for (let barIndex = 0; barIndex < uniqueDownbeats.length; barIndex += 1) {
    const startIndex = uniqueDownbeats[barIndex];
    const nextStartIndex = uniqueDownbeats[barIndex + 1];
    const barBeats = beats.slice(startIndex, nextStartIndex);
    if (!barBeats.length) {
      continue;
    }

    const meter = Math.max(1, barBeats[0].meter || barBeats.length || 4);
    const start = barBeats[0].time;
    const end =
      typeof nextStartIndex === "number"
        ? beats[nextStartIndex].time
        : barBeats[barBeats.length - 1].time + tailBeatLength;

    const units: HalfBeatUnit[] = [];
    for (let beatIndex = 0; beatIndex < barBeats.length; beatIndex += 1) {
      const beatStart = barBeats[beatIndex].time;
      const beatEnd =
        beatIndex < barBeats.length - 1 ? barBeats[beatIndex + 1].time : end;
      const half = (beatStart + beatEnd) / 2;

      units.push({ start: beatStart, end: half, globalUnit });
      globalUnit += 1;
      units.push({ start: half, end: beatEnd, globalUnit });
      globalUnit += 1;
    }

    bars.push({
      index: bars.length,
      meter,
      start,
      end,
      units,
    });
  }

  return bars;
};

const findNearestBeatUnitIndex = (time: number, units: HalfBeatUnit[]) => {
  if (!units.length) {
    return 0;
  }

  const beatUnits = units.filter((unit) => unit.globalUnit % 2 === 0);
  const candidates = beatUnits.length > 0 ? beatUnits : units;

  let bestUnit = candidates[0];
  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < candidates.length; index += 1) {
    const unit = candidates[index];
    const distance = Math.abs(time - unit.start);
    if (distance < minDistance) {
      minDistance = distance;
      bestUnit = unit;
    }
  }

  return bestUnit.globalUnit;
};

const buildQuantizedChords = (
  segments: ChordSegmentWithKey[],
  units: HalfBeatUnit[]
) => {
  if (!segments.length || !units.length) {
    return [] as QuantizedChord[];
  }

  const sorted = [...segments]
    .map((segment, sourceIndex) => ({
      label: segment.label,
      startTime: segment.start,
      sourceIndex,
      nearestBeatUnit: findNearestBeatUnitIndex(segment.start, units),
      startUnit: findNearestBeatUnitIndex(segment.start, units),
      key: segment.key,
    }))
    .sort((a, b) => a.startTime - b.startTime || a.sourceIndex - b.sourceIndex);

  // Beat-first quantization:
  // - default: snap to beat positions only
  // - allow half-beat only when:
  //   previous beat is occupied by previous chord, and next chord takes next beat
  const totalUnits = units[units.length - 1].globalUnit + 1;
  for (let index = 0; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const next = sorted[index + 1];
    let assigned = sorted[index].nearestBeatUnit;

    if (previous) {
      const prevUnit = previous.startUnit;
      if (assigned <= prevUnit) {
        const prevBeat = prevUnit % 2 === 0 ? prevUnit : prevUnit - 1;
        const nextBeat = next ? next.nearestBeatUnit : Number.POSITIVE_INFINITY;
        const canUseHalfBeat = nextBeat === prevBeat + 2;

        if (canUseHalfBeat) {
          assigned = prevBeat + 1;
        } else {
          assigned = prevBeat + 2;
        }
      }
    }

    const clamped = Math.max(0, Math.min(totalUnits - 1, assigned));
    sorted[index].startUnit = clamped;
  }

  sorted.sort((a, b) => a.startUnit - b.startUnit || a.startTime - b.startTime);

  const deduped: QuantizedChord[] = [];
  for (const chord of sorted) {
    const previous = deduped[deduped.length - 1];
    if (!previous || previous.startUnit !== chord.startUnit) {
      deduped.push(chord);
    }
  }

  for (let index = 0; index < deduped.length; index += 1) {
    const previousKey = index > 0 ? deduped[index - 1].key : undefined;
    deduped[index].showKeyMarker =
      !!deduped[index].key && deduped[index].key !== previousKey;
  }

  return deduped;
};

const buildBarChordSpans = (
  bar: BarData,
  quantizedChords: QuantizedChord[],
  totalUnits: number
) => {
  if (!bar.units.length) {
    return [] as BarChordSpan[];
  }

  const barStartUnit = bar.units[0].globalUnit;
  const barEndUnit = bar.units[bar.units.length - 1].globalUnit + 1;
  const spans: BarChordSpan[] = [];

  const anchorIndexesInBar: number[] = [];
  for (let index = 0; index < quantizedChords.length; index += 1) {
    const anchor = quantizedChords[index];
    if (anchor.startUnit >= barStartUnit && anchor.startUnit < barEndUnit) {
      anchorIndexesInBar.push(index);
    }
  }

  let carryIndex = -1;
  for (let index = quantizedChords.length - 1; index >= 0; index -= 1) {
    if (quantizedChords[index].startUnit < barStartUnit) {
      carryIndex = index;
      break;
    }
  }
  if (carryIndex !== -1) {
    anchorIndexesInBar.unshift(carryIndex);
  }

  const seen = new Set<number>();
  for (const chordIndex of anchorIndexesInBar) {
    if (seen.has(chordIndex)) {
      continue;
    }
    seen.add(chordIndex);

    const chord = quantizedChords[chordIndex];
    const nextChord = quantizedChords[chordIndex + 1];
    const rawStart = Math.max(chord.startUnit, barStartUnit);
    const rawEnd = Math.min(
      nextChord ? nextChord.startUnit : totalUnits,
      barEndUnit
    );

    if (rawEnd <= rawStart) {
      continue;
    }

    spans.push({
      label: chord.label,
      sourceIndex: chord.sourceIndex,
      startUnitInBar: rawStart - barStartUnit,
      spanUnits: rawEnd - rawStart,
      seekTime: chord.startTime,
      showLabel:
        chord.startUnit >= barStartUnit && chord.startUnit < barEndUnit,
      key: chord.key,
      showKeyMarker: chord.showKeyMarker,
    });
  }

  return spans;
};

export function RecognitionResult({
  audioUrl,
  segments,
  beats,
}: RecognitionResultProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [activeChordIndex, setActiveChordIndex] = useState(-1);
  const bars = useMemo(() => buildBars(beats), [beats]);
  const allUnits = useMemo(() => bars.flatMap((bar) => bar.units), [bars]);
  const quantizedChords = useMemo(
    () => buildQuantizedChords(segments, allUnits),
    [allUnits, segments]
  );
  const totalUnits = allUnits.length;
  const canRenderBeatGrid = bars.length > 0 && totalUnits > 0;

  const updateActiveChord = (currentTime: number) => {
    const nextActiveIndex = getActiveChordIndex(currentTime, segments, {
      preHighlightMs: 200,
    });
    setActiveChordIndex((previous) =>
      previous === nextActiveIndex ? previous : nextActiveIndex
    );
  };

  const seekToChordTime = (time: number) => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.currentTime = time;
  };

  useEffect(() => {
    setActiveChordIndex(-1);
  }, [audioUrl, segments]);

  if (!audioUrl || segments.length === 0) {
    return (
      <div className="rounded-lg py-16">
        <Empty description={""} />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4 flex flex-col gap-4">
      <audio
        ref={audioRef}
        src={audioUrl}
        controls
        className="w-full"
        onTimeUpdate={(event) =>
          updateActiveChord(event.currentTarget.currentTime)
        }
        onSeeking={(event) =>
          updateActiveChord(event.currentTarget.currentTime)
        }
        onLoadedMetadata={(event) =>
          updateActiveChord(event.currentTarget.currentTime)
        }
      />

      {canRenderBeatGrid ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 min-[1080px]:grid-cols-4 gap-2">
          {bars.map((bar) => (
            <BarGridLine
              key={`bar-${bar.index}`}
              bar={bar}
              quantizedChords={quantizedChords}
              totalUnits={totalUnits}
              activeChordIndex={activeChordIndex}
              onSeek={seekToChordTime}
            />
          ))}
        </div>
      ) : (
        <SegmentFallbackList
          segments={segments}
          activeChordIndex={activeChordIndex}
          onSeek={seekToChordTime}
        />
      )}
    </div>
  );
}
