"use client";

import { useEffect, useRef, useState } from "react";
import * as ABCJS from "abcjs";
import { parseRootNote } from "@/utils/calc";
import type { NoteStatus } from "@/types/rhythm";

interface AbcStaffNotationProps {
  root?: string;
  str: string;
  options?: any;
  needConvert?: boolean;
  concise?: boolean;
  noteStatus?: NoteStatus[];
}

export default function AbcStaffNotation({
  root = "C4",
  str,
  concise = false,
  noteStatus = [],
  options = {},
}: AbcStaffNotationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const visualObjRef = useRef<any>(null);

  useEffect(() => {
    const renderAbc = () => {
      if (containerRef.current && str) {
        setIsLoading(true);

        try {
          // 清空容器
          containerRef.current.innerHTML = "";
          containerRef.current.style.width = "auto";
          // 检测是否为移动端
          const isMobile = window.innerWidth <= 768;

          const opts = concise
            ? {
                paddingtop: 4,
                paddingbottom: 4,
                paddingleft: 0,
                paddingright: 0,
              }
            : {
                paddingleft: isMobile ? 10 : 20,
                paddingright: isMobile ? 10 : 20,
                paddingtop: isMobile ? 8 : 10,
                paddingbottom: isMobile ? 15 : 20,
              };
          // 渲染五线谱
          const fullAbc = `
${str}
`;

          // console.log({ ...opts, ...options });
          visualObjRef.current = ABCJS.renderAbc(
            containerRef.current,
            fullAbc,
            { ...opts, ...options }
          );

          const g = containerRef.current.querySelector("g");
          const width = g.getBBox().width;
          console.log(g, g.getBoundingClientRect(), width);
          containerRef.current.style.width = `${width}px`;
        } catch (error) {
          console.error("Failed to render abc notation:", error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    renderAbc();
  }, [concise, root, str]);

  // 根据状态数组和当前播放索引更新音符颜色
  useEffect(() => {
    if (visualObjRef.current && visualObjRef.current[0]) {
      try {
        // 清除之前的所有样式类
        const svgElement = containerRef.current?.querySelector("svg");
        if (svgElement) {
          const allNoteElements = svgElement.querySelectorAll(
            ".abcjs-correct, .abcjs-incorrect, .abcjs-playing"
          );
          allNoteElements.forEach((el) => {
            el.classList.remove(
              "abcjs-correct",
              "abcjs-incorrect",
              "abcjs-playing"
            );
          });
        }

        const visualObj = visualObjRef.current[0];
        if (
          visualObj.lines &&
          visualObj.lines[0] &&
          visualObj.lines[0].staff &&
          visualObj.lines[0].staff[0]
        ) {
          const voices = visualObj.lines[0].staff[0].voices;
          if (voices && voices[0]) {
            // 根据状态数组设置音符颜色
            noteStatus.forEach((status, index) => {
              if (voices[0][index]) {
                const noteElement = voices[0][index];
                if (noteElement.abselem && noteElement.abselem.elemset) {
                  noteElement.abselem.elemset.forEach((elem: any) => {
                    if (elem.classList) {
                      if (status === "correct") {
                        elem.classList.add("abcjs-correct");
                      } else if (status === "incorrect") {
                        elem.classList.add("abcjs-incorrect");
                      } else if (status === "playing") {
                        elem.classList.add("abcjs-playing");
                      }
                    }
                  });
                }
              }
            });
          }
        }
      } catch (error) {
        console.error("Failed to update note colors:", error);
      }
    }
  }, [noteStatus]);

  return (
    <div className="w-full flex justify-center pointer-events-none overflow-x-auto border rounded-lg bg-white">
      {isLoading ? (
        <div className="flex justify-center items-center p-8">
          <div className="text-gray-500">正在渲染五线谱...</div>
        </div>
      ) : (
        <div ref={containerRef} />
      )}
      <style jsx>{`
        :global(.abcjs-highlight) {
          fill: #ff6b6b !important;
          stroke: #ff6b6b !important;
          opacity: 0.8;
        }
        :global(.abcjs-correct) {
          fill: #52c41a !important;
          stroke: #52c41a !important;
          opacity: 1;
        }
        :global(.abcjs-incorrect) {
          fill: #ff4d4f !important;
          stroke: #ff4d4f !important;
          opacity: 1;
        }
        :global(.abcjs-playing) {
          fill: #aaa !important;
          stroke: #aaa !important;
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}
