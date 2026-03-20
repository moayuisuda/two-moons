import { NOTES } from "@/utils/calc";
import MoaTone from "@/utils/MoaTone";
import { getRandom } from "@/utils/number";
import { Radio, Select, Space, Switch } from "antd";
import { useEffect } from "react";
import { sample, sampleSize, shuffle } from "lodash";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { noteMap, chord as genChord } from "rad.js";
import {
  usePracticeState,
  PracticeComponent,
  RootInput,
  usePlanProgressTracker,
  MultiSelect,
} from "./components";
import styles from "./index.module.scss";
import { PROGRESSIONS, DEGREE_TO_CHORD_OFFSET } from "@/constants/progression";
import { appStore } from "@/stores/store";

export const ChordProgression = () => {
  const { t } = useTranslation("practice");
  const { state, synthRef, resetStats } = usePracticeState(
    () => ({
      root: "C3",
      enable7th: false,
      selectedProgressions: [
        "IV - V - I - vi",
        "IV - iii - ii - I",
        "ii - V - I - vi",
      ],
      pass: 0,
      all: 0,
      current: {
        octave: 0,
        base: "",
        progression: null,
        answer: "",
        options: [],
      },
    }),
    "PRACTICE_CHORD_PROGRESSION_CONFIG",
    ["root", "selectedProgressions", "enable7th"]
  );
  usePlanProgressTracker("sings.progression", state);

  const { current, selectedProgressions, enable7th } = useSnapshot(state);
  const { root: staticRoot } = useSnapshot(state, { sync: true });

  const getVoicing = (degrees: string[]) => {
    return degrees.map((d) => {
      const semitones = DEGREE_TO_CHORD_OFFSET[d]?.semitones || 0;
      if (semitones >= 7) {
        return Math.random() < 0.5 ? -1 : 0;
      }
      return 0;
    });
  };

  const newProgression = () => {
    let pool = PROGRESSIONS.filter((p) =>
      state.selectedProgressions.includes(p.label)
    );

    const progression = sample(pool);
    // Generate voicing for the correct answer
    const progressionVoicing = getVoicing(progression.degrees);
    state.current.progression = { ...progression, voicing: progressionVoicing };
    const otherOptions = sampleSize(
      pool.filter((p) => p.label !== progression.label),
      state.selectedProgressions.filter((p) => p.label !== progression.label)
        .length - 1
    );

    console.log({ otherOptions });
    // Combine and add voicing to all options
    // 这种随机的东西，一定不能在播放的时候生成，而是在生成问题的时候，就生成 optionsWithxx
    // 播放的时候，用 withxxx 中实际带有播放属性的东西来播放
    const allOptions = [
      state.current.progression,
      ...otherOptions.map((p) => ({
        ...p,
        voicing: getVoicing(p.degrees),
      })),
    ];

    state.current.options = shuffle(allOptions);

    // 如果设置了根音，使用设置的根音，否则随机生成
    if (staticRoot && staticRoot.trim()) {
      const rootMatch = staticRoot.match(/^([A-G][#b]?)(\d+)?/);
      if (rootMatch) {
        state.current.base = rootMatch[1];
        state.current.octave = rootMatch[2] ? parseInt(rootMatch[2]) : 3;
      } else {
        state.current.base = sample(NOTES);
        state.current.octave = getRandom(3, 4);
      }
    } else {
      state.current.base = sample(NOTES);
      state.current.octave = getRandom(3, 4);
    }
    state.current.answer = "";
    state.all += 1;
  };

  const getChordNotes = (base, octave, degree, voicingOffset = 0) => {
    const config = DEGREE_TO_CHORD_OFFSET[degree];
    if (!config) return [];

    const baseNoteIndex = noteMap[base] || 0;
    const targetNoteIndex = (baseNoteIndex + config.semitones) % 12;
    const targetNoteName =
      Object.keys(noteMap).find((key) => noteMap[key] === targetNoteIndex) ||
      "C";

    // 计算八度变化
    const octaveOffset = Math.floor((baseNoteIndex + config.semitones) / 12);
    const targetOctave = octave + octaveOffset + voicingOffset;

    let type = config.type;
    if (state.enable7th) {
      if (degree === "V") type = "7";
      else if (config.type === "M") type = "M7";
      else if (config.type === "m") type = "m7";
      else if (config.type === "dim") type = "m7b5";
    }

    return genChord(targetNoteName + type, targetOctave);
  };

  const play = async () => {
    MoaTone.Transport.cancel();

    if (!state.current.progression) return;

    if (!synthRef.current)
      synthRef.current = new MoaTone.Synth({
        preset: appStore.audioPreset.piano,
      }).toDestination();

    await MoaTone.start();

    const degrees = state.current.progression.degrees;
    const now = MoaTone.now();
    const duration = 1; // 每个和弦持续时间

    // Play root note first
    const rootNote = `${state.current.base}${state.current.octave}`;
    synthRef.current.triggerAttackRelease(rootNote, duration, now);

    // Start chords after root note + buffer
    const startTime = now + duration + 0.5;

    degrees.forEach((degree, index) => {
      const voicingOffset = state.current.progression.voicing
        ? state.current.progression.voicing[index]
        : 0;
      const notes = getChordNotes(
        state.current.base,
        state.current.octave,
        degree,
        voicingOffset
      );
      const time = startTime + index * duration;

      // 简单的和弦播放
      MoaTone.schedule((t) => {
        synthRef.current.triggerAttackRelease(notes, duration * 0.9, t);
      }, time);
    });
  };

  const playOption = async (progressionLabel) => {
    MoaTone.Transport.cancel();

    const option = state.current.options.find(
      (p) => p.label === progressionLabel
    );
    if (!option) return;

    if (!synthRef.current)
      synthRef.current = new MoaTone.Synth({
        preset: appStore.audioPreset.piano,
      }).toDestination();

    await MoaTone.start();

    const degrees = option.degrees;
    const now = MoaTone.now();
    const duration = 0.8;

    degrees.forEach((degree, index) => {
      const voicingOffset = option.voicing ? option.voicing[index] : 0;
      const notes = getChordNotes(
        state.current.base,
        state.current.octave,
        degree,
        voicingOffset
      );
      const time = now + index * duration;
      MoaTone.schedule((t) => {
        synthRef.current.triggerAttackRelease(notes, duration * 0.9, t);
      }, time);
    });
  };

  useEffect(() => {
    resetStats();
    newProgression();
  }, [staticRoot, selectedProgressions, enable7th]);

  return (
    <PracticeComponent
      title={t("和弦进行")}
      imageSrc="/pics/harmony.png"
      imageAlt="harmony"
      state={state}
      onPlay={play}
      onNewQuestion={newProgression}
      onOptionPlay={playOption}
      isVerticalRadio={true}
      getCorrectAnswer={() => current.progression?.label}
      getCurrentAnswer={() => current.answer}
      onAnswerChange={(value) => {
        state.current.answer = value;
      }}
      customTitle={undefined}
      getStaffNotationData={undefined}
      renderOptions={(hasAnswered, onOptionPlay) => {
        const correctAnswer = current.progression?.label;
        return (current.options || []).map((p) => (
          <Radio
            key={p.label}
            value={p.label}
            className={
              hasAnswered && p.label === correctAnswer
                ? styles["checkbox--right"]
                : ""
            }
            onClick={() => onOptionPlay && onOptionPlay(p.label)}
          >
            {p.label}
          </Radio>
        ));
      }}
      renderExtra={() => (
        <Space>
          <div className="flex flex-col gap-2 md:flex-row items-center">
            <RootInput
              value={staticRoot}
              onChange={(val) => (state.root = val)}
              tooltip={t(
                '根音为空时随机生成根音和八度。按照形似"C4"、"Bb4"来填写。'
              )}
            />
            <Switch
              checkedChildren="7th"
              unCheckedChildren="7th"
              checked={state.enable7th}
              onChange={(v) => (state.enable7th = v)}
            />
          </div>

          <MultiSelect
            value={selectedProgressions}
            maxTagCount={2}
            onChange={(v) => (state.selectedProgressions = v)}
            options={PROGRESSIONS.map((p) => ({
              label: p.label.replace(" ", ""),
              value: p.label,
            }))}
            label={t("进行")}
          />
        </Space>
      )}
    />
  );
};
