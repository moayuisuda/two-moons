import { useEffect, useRef, useState } from "react";
import { wrap, proxy } from "comlink";

export interface ChordSegment {
  /**
   * In seconds
   */
  start: number;
  /**
   * In seconds
   */
  end: number;
  /**
   * Possible labels (with root note C as example):
   * - C:min/b7
   * - C:min/2
   * - C:maj/b7
   * - C:maj/2
   * - C:sus4(b7)
   * - C:sus2
   * - C:sus4
   * - C:13
   * - C:11
   * - C:min9
   * - C:9
   * - C:maj9
   * - C:dim7
   * - C:hdim7
   * - C:min7
   * - C:7
   * - C:maj7
   * - C:min/5
   * - C:min/b3
   * - C:maj/5
   * - C:maj/3
   * - C:dim
   * - C:aug
   * - C:min
   * - C:maj
   * - N
   */
  label: string;
}

export type MeteredBeatEvent = {
  time: number;
  beatInBar: number;
  meter: number;
  isDownbeat: boolean;
};

interface RecognizeChordsArgs {
  audio: File;
}

interface RecognizeBeatsArgs {
  audio: File;
}

interface ChordMiniApi {
  recognizeChords: (
    args: RecognizeChordsArgs,
    onLogProgress?: (message: string, stepProgress?: number) => void
  ) => Promise<ChordSegment[]>;
  recognizeBeats: (
    args: RecognizeBeatsArgs,
    onLogProgress?: (message: string, stepProgress?: number) => void
  ) => Promise<MeteredBeatEvent[]>;
  forceUpdate: () => void;
  version: () => string;
}

export interface RecognitionApi {
  recognizeChords: (
    args: RecognizeChordsArgs,
    onLogProgress?: (
      message: string,
      /** 0 ~ 100 */ stepProgress?: number
    ) => void
  ) => Promise<ChordSegment[]>;
  recognizeBeats: (
    args: RecognizeBeatsArgs,
    onLogProgress?: (message: string, stepProgress?: number) => void
  ) => Promise<MeteredBeatEvent[]>;
}

export function useChordMiniApi() {
  const [recognitionApi, setRecognitionApi] = useState<RecognitionApi | null>(
    null
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      console.warn("[ChordMiniApi]: iframeRef is not set");
      return;
    }

    let disposed = false;
    let connected = false;

    const connect = () => {
      if (disposed || connected || !iframe.contentWindow) {
        return;
      }

      const channel = new MessageChannel();
      const api = wrap<ChordMiniApi>(channel.port1);

      console.log("[ChordMiniApi]: Connecting to ChordMini Api...");
      iframe.contentWindow.postMessage(
        {
          type: "chordmini-api",
          port: channel.port2,
        },
        "*",
        [channel.port2]
      );

      channel.port1.addEventListener(
        "message",
        (event) => {
          if (disposed) {
            return;
          }
          connected = true;
          console.log("[ChordMiniApi]: Connected to ChordMini Api", event.data);
          setRecognitionApi({
            recognizeChords: (args, callback) => {
              return api.recognizeChords(
                args, // cloned (lightweight file handle)
                callback ? proxy(callback) : undefined // proxied (callable function)
              );
            },
            recognizeBeats: (args, callback) => {
              return api.recognizeBeats(
                args, // cloned (lightweight file handle)
                callback ? proxy(callback) : undefined // proxied (callable function)
              );
            },
          });
        },
        { once: true }
      );

      channel.port1.start();
    };

    const interval = setInterval(connect, 1400);

    return () => {
      disposed = true;
      clearInterval(interval);
      console.log("[ChordMiniApi]: Disposed");
    };
  }, []);

  return {
    recognitionApi,
    iframeRef,
  };
}
