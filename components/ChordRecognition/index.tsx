import { useEffect, useRef, useState } from "react";
import { Spin } from "antd";
import { ChordSegment, useChordMiniApi } from "./api";
import { UploadProcessing } from "./UploadProcessing";
import { RecognitionResult } from "./RecognitionResult";
import { useTranslation } from "react-i18next";

interface ConnectionStatusProps {
  isConnected: boolean;
}

function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  const { t } = useTranslation("common");

  if (isConnected) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
      <Spin size="small" />
      <span>{t("加载中")}</span>
    </div>
  );
}

export function ChordRecognition() {
  const { iframeRef, recognitionApi } = useChordMiniApi();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [segments, setSegments] = useState<ChordSegment[]>([]);
  const objectUrlRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const startRecognition = async (audioFile: File) => {
    if (!recognitionApi) {
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    }

    const nextUrl = URL.createObjectURL(audioFile);
    objectUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
    setSegments([]);
    setErrorMessage("");
    setIsProcessing(true);
    setProgressPercent(0);
    setProgressText("Uploading audio...");

    try {
      const result = await recognitionApi.recognizeChords(
        {
          audio: audioFile,
        },
        (message, stepProgress) => {
          setProgressText(message || "Processing audio...");
          if (typeof stepProgress === "number") {
            setProgressPercent(stepProgress);
          }
        }
      );

      setSegments(result);
      setProgressPercent(100);
      setProgressText("Recognition complete.");
    } catch (error) {
      console.error("[ChordRecognition]: recognizeChords failed", error);
      setErrorMessage("Chord recognition failed. Please try another file.");
      setProgressText("Recognition failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 flex flex-col gap-4">
      <iframe
        ref={iframeRef}
        src="https://chordmini-web.pages.dev/"
        width="0"
        height="0"
        style={{
          border: 0,
          opacity: 0,
          pointerEvents: "none",
          position: "absolute",
        }}
        title="ChordMini Api Frame"
      />

      <div className="p-4 flex flex-col gap-3 max-w-md w-full mx-auto items-center text-center">
        <ConnectionStatus isConnected={!!recognitionApi} />
        <UploadProcessing
          isConnected={!!recognitionApi}
          isProcessing={isProcessing}
          progressText={progressText}
          progressPercent={progressPercent}
          errorMessage={errorMessage}
          onSelectFile={(file) => {
            void startRecognition(file);
          }}
        />
      </div>

      <RecognitionResult audioUrl={audioUrl} segments={segments} />

      <div className="text-xs text-gray-500 text-center opacity-40">
        Recognition powered by{" "}
        <a
          href="https://chordmini-web.pages.dev/"
          target="_blank"
          rel="noopener noreferrer"
        >
          ChordMini Web
        </a>
      </div>
    </div>
  );
}
