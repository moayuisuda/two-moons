import { ChordSegment } from "./api";
import { memo, useEffect, useRef, useState } from "react";
import {
  estimateBeatSeconds,
  formatTime,
  getActiveChordIndex,
  getSegmentBeatSpan,
} from "./utils";
import { Empty } from "antd";

interface RecognitionResultProps {
  audioUrl: string;
  segments: ChordSegment[];
}

interface ChordSegmentBlockProps {
  segment: ChordSegment;
  index: number;
  activeChordIndex: number;
  beatSeconds: number;
  onClick?: () => void;
}

function ChordSegmentBlockView({
  segment,
  index,
  activeChordIndex,
  beatSeconds,
  onClick,
}: ChordSegmentBlockProps) {
  const isActive = index === activeChordIndex;
  const beatSpan = getSegmentBeatSpan(segment, beatSeconds);

  return (
    <div
      key={`${segment.start}-${segment.end}-${index}`}
      className={`px-2 py-2 rounded-sm border-0 border-solid border-transparent border-l-2  transition-colors duration-200 cursor-pointer ${
        isActive
          ? "bg-sky-100 text-gray-900 border-l-sky-600/40"
          : "bg-gray-100 text-gray-800 border-l-black/40"
      }`}
      style={{
        flex: `${beatSpan} 0 ${Math.max(56, beatSpan * 40)}px`,
      }}
      onClick={onClick}
    >
      <div className="font-semibold">{segment.label || "N"}</div>
      <div className="text-[10px] text-gray-400">
        {formatTime(segment.start)}
        {/* - {formatTime(segment.end)} */}
      </div>
    </div>
  );
}

const ChordSegmentBlock = memo(ChordSegmentBlockView);

export function RecognitionResult({
  audioUrl,
  segments,
}: RecognitionResultProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [activeChordIndex, setActiveChordIndex] = useState(-1);
  const beatSeconds = estimateBeatSeconds(segments);

  const updateActiveChord = (currentTime: number) => {
    const nextActiveIndex = getActiveChordIndex(currentTime, segments);
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

      <div className="flex flex-wrap gap-2">
        {segments.map((segment, index) => (
          <ChordSegmentBlock
            key={`${segment.start}-${segment.end}-${index}`}
            segment={segment}
            index={index}
            activeChordIndex={activeChordIndex}
            beatSeconds={beatSeconds}
            onClick={() => seekToChordTime(segment.start)}
          />
        ))}
      </div>
    </div>
  );
}
