/**
 * MoaTone - A lightweight audio synthesis library to replace Tone.js
 * Provides essential audio synthesis capabilities with simpler API
 */

import _ from "lodash";
import { appStore } from "@/stores/store";
import { getFrequency, parseNote } from "./calc";
import { soundPresets } from "./soundPresets";

type AudioOptions = {
  volume?: number;
  reverbLevel?: number;
  preset?: keyof typeof soundPresets;
};

class MoaTime {
  static toSeconds(notation: string | number): number {
    if (typeof notation === "number") return notation;

    const timeMap: { [key: string]: number } = {
      "1n": 4, // whole note
      "2n": 2, // half note
      "4n": 1, // quarter note
      "8n": 0.5, // eighth note
      "16n": 0.25, // sixteenth note
      "32n": 0.125, // sixteenth note
    };

    const baseTime = timeMap[notation] || 1;
    return baseTime * (60 / MoaTransport.bpm); // Convert to seconds based on BPM
  }
}

// Unit type definitions for compatibility with Tone.js
// 简化的时间类型定义，替代MoaUnit命名空间
export type MoaTimeType = number | string;

class MoaSynth {
  private audioContext: AudioContext;
  private gainNode: GainNode;
  private preset: keyof typeof soundPresets;
  private activeNodes: Map<string, any> = new Map();

  constructor(options: AudioOptions = {}) {
    this.audioContext = MoaAudio.getContext();
    this.preset = options.preset || "sine";
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
  }

  setPreset(preset: keyof typeof soundPresets): void {
    this.preset = preset;
  }

  toDestination(): MoaSynth {
    return this;
  }

  triggerAttackRelease(
    note: string | string[],
    duration: number | string,
    time?: number | string,
    swing: number = 0.02
  ): void {
    const notes = Array.isArray(note) ? note : [note];
    const startTime =
      typeof time === "string"
        ? MoaTime.toSeconds(time) + this.audioContext.currentTime
        : time || this.audioContext.currentTime;

    const durationInSeconds =
      typeof duration === "string" ? MoaTime.toSeconds(duration) : duration;

    if (notes.length === 1) {
      // 单音符播放，使用原来的逻辑
      this.playNote(notes[0], durationInSeconds, startTime);
    } else {
      notes.forEach((singleNote, index) => {
        // Slight delay between notes for better chord effect
        const noteStartTime = startTime + Math.random() * swing;
        this.playNote(singleNote, durationInSeconds, noteStartTime);
      });
    }
  }

  triggerAttackReleaseArpeggio(
    notes: string[],
    arpeggioInterval: number,
    duration: number,
    swing: number = 0.02
  ): void {
    const startTime = this.audioContext.currentTime;

    if (notes.length === 1) {
      // 单音符播放，使用原来的逻辑
      this.playNote(notes[0], duration, startTime);
    } else {
      notes.forEach((singleNote, index) => {
        // Slight delay between notes for better chord effect
        const swingTime = arpeggioInterval === 0 ? Math.random() * swing : 0;

        this.playNote(
          singleNote,
          duration,
          startTime + index * arpeggioInterval + swingTime
        );
      });
    }
  }

  private async playNote(note: string, duration: number, startTime: number) {
    await MoaAudio.start();
    const frequency = this.noteToFrequency(note);
    const endTime = startTime + duration;

    // Use soundPresets to create audio nodes
    const presetConfig = soundPresets[this.preset];
    const audioNodes = presetConfig.createNodes(this.audioContext);

    // Connect preset output to envelope, then to gain node
    audioNodes.output.connect(this.gainNode);

    // Set frequency using preset's setFrequency method
    audioNodes.setFrequency(frequency, startTime);

    audioNodes.start(startTime);

    audioNodes.stop(endTime);
  }

  triggerAttack(note: string, time?: number): void {
    const startTime = time || this.audioContext.currentTime;
    this.startNote(note, startTime);
  }

  triggerRelease(note?: string, time?: number): void {
    const releaseTime = time || this.audioContext.currentTime;
    if (note) {
      // 释放特定音符
      const audioNodes = this.activeNodes.get(note);
      if (audioNodes) {
        audioNodes.stop(releaseTime);
        this.activeNodes.delete(note);
      }
    } else {
      // 释放所有活跃音符
      this.activeNodes.forEach((audioNodes, noteKey) => {
        audioNodes.stop(releaseTime);
      });
      this.activeNodes.clear();
    }
  }

  releaseAll(): void {
    this.activeNodes.forEach((audioNodes, noteKey) => {
      audioNodes.stop();
    });
    this.activeNodes.clear();
  }

  private async startNote(note: string, startTime: number) {
    await MoaAudio.start();
    const frequency = this.noteToFrequency(note);

    // Use soundPresets to create audio nodes
    const presetConfig = soundPresets[this.preset];
    const audioNodes = presetConfig.createNodes(this.audioContext);

    // Connect preset output to envelope, then to gain node
    audioNodes.output.connect(this.gainNode);

    // Set frequency using preset's setFrequency method
    audioNodes.setFrequency(frequency, startTime);
    audioNodes.start(startTime);

    // 存储活跃的音符节点
    this.activeNodes.set(note, audioNodes);
  }

  private noteToFrequency(note: string): number {
    try {
      const { note: noteName, octave } = parseNote(note);
      return getFrequency({ name: noteName, octave });
    } catch (error) {
      console.warn(`Invalid note format: ${note}`);
      return 440; // Default to A4
    }
  }
}

type TickerClockSource = "worker" | "timeout" | "offline";

/**
 * A class which provides a reliable callback using either
 * a Web Worker, or if that isn't supported, falls back to setTimeout.
 * Based on Tone.js Ticker implementation.
 */
class MoaTicker {
  /**
   * Either "worker" or "timeout" or "offline"
   */
  private _type: TickerClockSource;

  /**
   * The update interval of the worker in seconds
   */
  private _updateInterval: number;

  /**
   * The lowest allowable interval, preferably calculated from context sampleRate
   */
  private _minimumUpdateInterval: number;

  /**
   * The callback to invoke at regular intervals
   */
  private _callback: () => void;

  /**
   * track the callback interval
   */
  private _timeout?: ReturnType<typeof setTimeout>;

  /**
   * private reference to the worker
   */
  private _worker?: Worker;

  constructor(
    callback: () => void,
    type: TickerClockSource,
    updateInterval: number,
    contextSampleRate?: number
  ) {
    this._callback = callback;
    this._type = type;
    /**
     - 音频缓冲区大小 ：128 表示音频缓冲区的采样帧数（samples per buffer），这个是可以按需调整，比如想要大的缓冲区就设置为 256
     - 时间计算 ： 128 / (contextSampleRate || 44100) 计算的是处理这128个采样帧所需的时间（秒）
     */
    this._minimumUpdateInterval = Math.max(
      128 / (contextSampleRate || 44100),
      0.001
    );
    this.updateInterval = updateInterval;

    // create the clock source for the first time
    this._createClock();
  }

  /**
   * Generate a web worker
   */
  private _createWorker(): void {
    const blob = new Blob(
      [
        /* javascript */ `
        // the initial timeout time
        let timeoutTime = ${(this._updateInterval * 1000).toFixed(1)};
        // onmessage callback
        self.onmessage = function(msg){
          timeoutTime = parseInt(msg.data);
        };
        // the tick function which posts a message
        // and schedules a new tick
        function tick(){
          setTimeout(tick, timeoutTime);
          self.postMessage('tick');
        }
        // call tick initially
        tick();
        `,
      ],
      { type: "text/javascript" }
    );
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl);

    worker.onmessage = this._callback.bind(this);

    this._worker = worker;
  }

  /**
   * Create a timeout loop
   */
  private _createTimeout(): void {
    this._timeout = setTimeout(() => {
      this._createTimeout();
      this._callback();
    }, this._updateInterval * 1000);
  }

  /**
   * Create the clock source.
   */
  private _createClock(): void {
    if (this._type === "worker") {
      try {
        this._createWorker();
      } catch (e) {
        // workers not supported, fallback to timeout
        this._type = "timeout";
        this._createClock();
      }
    } else if (this._type === "timeout") {
      this._createTimeout();
    }
  }

  /**
   * Clean up the current clock source
   */
  private _disposeClock(): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    if (this._worker) {
      this._worker.terminate();
      this._worker.onmessage = null;
    }
  }

  /**
   * The rate in seconds the ticker will update
   */
  get updateInterval(): number {
    return this._updateInterval;
  }
  set updateInterval(interval: number) {
    this._updateInterval = Math.max(interval, this._minimumUpdateInterval);
    if (this._type === "worker" && this._worker) {
      this._worker.postMessage(this._updateInterval * 1000);
    }
  }

  /**
   * The type of the ticker, either a worker or a timeout
   */
  get type(): TickerClockSource {
    return this._type;
  }
  set type(type: TickerClockSource) {
    this._disposeClock();
    this._type = type;
    this._createClock();
  }

  /**
   * Clean up
   */
  dispose(): void {
    this._disposeClock();
  }
}

interface ScheduledEvent {
  id: string;
  callback: (time: number) => void;
  interval: number;
  nextTime: number;
  ticker?: MoaTicker;
  isOneTime?: boolean; // Flag for one-time events
}

class MoaTransport {
  static bpm: number = 120;
  private static isRunning: boolean = false;
  private static scheduledEvents: Map<string, ScheduledEvent> = new Map();
  private static eventIdCounter: number = 0;
  private static lookAhead: number = 0.05; // 50ms look ahead
  private static scheduleAheadTime: number = 0.025; // 25ms schedule ahead time
  private static ticker?: MoaTicker;

  static start(): void {
    MoaTransport.isRunning = true;
    if (!MoaTransport.ticker) {
      MoaTransport.ticker = new MoaTicker(
        MoaTransport._tick.bind(MoaTransport),
        "worker",
        MoaTransport.scheduleAheadTime
      );
    }
  }

  static stop(): void {
    MoaTransport.isRunning = false;
    if (MoaTransport.ticker) {
      MoaTransport.ticker.dispose();
      MoaTransport.ticker = undefined;
    }
  }

  static cancel(): void {
    MoaTransport.scheduledEvents.clear();
    MoaTransport.stop();
  }

  /**
   * The main tick function that schedules events using lookAhead
   */
  private static _tick(): void {
    if (!MoaTransport.isRunning) return;

    const audioContext = MoaAudio.getContext();
    const currentTime = audioContext.currentTime;
    const lookAheadTime = currentTime + MoaTransport.lookAhead;

    // Process all scheduled events
    const eventsToRemove: string[] = [];

    /**
      - 假设有一个每50ms重复的事件
      - 当前时间：0ms，lookAhead：100ms
      - 第一次tick：调度0ms和50ms的事件，nextTime更新为100ms
      - 第二次tick（25ms后）：当前时间25ms，lookAhead到125ms，只会调度100ms的事件
     */
    MoaTransport.scheduledEvents.forEach((event) => {
      // Schedule all events that should happen within the look-ahead window
      while (event.nextTime < lookAheadTime) {
        // Schedule the callback to be executed at the precise audio time
        event.callback(event.nextTime);

        // Handle one-time events
        if (event.isOneTime) {
          eventsToRemove.push(event.id);
          break;
        }

        // Update next execution time for repeating events
        event.nextTime += event.interval;
      }
    });

    // Remove one-time events that have been executed
    eventsToRemove.forEach((eventId) => {
      MoaTransport.scheduledEvents.delete(eventId);
    });

    // Stop the transport if no events are scheduled
    if (MoaTransport.scheduledEvents.size === 0) {
      MoaTransport.stop();
    }
  }

  static scheduleRepeat(
    callback: (time: number) => void,
    interval: string | number
  ): string {
    const eventId = `event_${++MoaTransport.eventIdCounter}`;
    const intervalSeconds =
      typeof interval === "string" ? MoaTime.toSeconds(interval) : interval;

    const audioContext = MoaAudio.getContext();
    const currentTime = audioContext.currentTime;
    // Add scheduleAheadTime to ensure the first event is scheduled in the future
    const firstEventTime = currentTime + MoaTransport.scheduleAheadTime;
    // const firstEventTime = currentTime;

    const event: ScheduledEvent = {
      id: eventId,
      callback,
      interval: intervalSeconds,
      nextTime: firstEventTime, // Schedule first event slightly in the future
    };

    MoaTransport.scheduledEvents.set(eventId, event);

    // Start the transport if it's not running
    if (!MoaTransport.isRunning) {
      MoaTransport.start();
    }

    return eventId;
  }

  static schedule(callback: (time: number) => void, time: number): string {
    const eventId = `event_${++MoaTransport.eventIdCounter}`;
    const audioContext = MoaAudio.getContext();
    const currentTime = audioContext.currentTime;
    const scheduleTime = time || currentTime;

    const event: ScheduledEvent = {
      id: eventId,
      callback,
      interval: 0, // Not used for one-time events
      nextTime: scheduleTime,
      isOneTime: true,
    };

    MoaTransport.scheduledEvents.set(eventId, event);

    // Start the transport if it's not running
    if (!MoaTransport.isRunning) {
      MoaTransport.start();
    }

    return eventId;
  }

  static clear(eventId: string): void {
    MoaTransport.scheduledEvents.delete(eventId);

    // Stop the transport if no events are scheduled
    if (MoaTransport.scheduledEvents.size === 0) {
      MoaTransport.stop();
    }
  }

  /**
   * Set the look ahead time in seconds
   */
  static setLookAhead(time: number): void {
    MoaTransport.lookAhead = Math.max(time, 0.001);
  }

  /**
   * Set the schedule ahead time in seconds
   */
  static setScheduleAheadTime(time: number): void {
    MoaTransport.scheduleAheadTime = Math.max(time, 0.001);
    if (MoaTransport.ticker) {
      MoaTransport.ticker.updateInterval = time;
    }
  }
}

export class MoaAudio {
  private static audioContext: AudioContext | null = null;

  static getContext(): AudioContext {
    if (!MoaAudio.audioContext) {
      MoaAudio.audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
    }
    return MoaAudio.audioContext;
  }

  static resetContext(): void {
    MoaAudio.audioContext = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
  }

  static async start(): Promise<void> {
    const context = MoaAudio.getContext();
    await context.resume();
  }

  static now(): number {
    return MoaAudio.getContext().currentTime;
  }
}

/**
 * Sleep function for creating delays in async operations
 * @param ms - Number of milliseconds to sleep
 * @returns Promise that resolves after the specified time
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Types for MoaPlayer
type PlayerNote = {
  time: number;
  value: string;
  duration: number;
};

type PlayerData = {
  bpm: number;
  timeLength: number;
  notes: PlayerNote[];
};

// Drum-specific synthesizers
class MoaMembraneSynth {
  private audioContext: AudioContext;
  private gainNode: GainNode;

  constructor() {
    this.audioContext = MoaAudio.getContext();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0.8; // 适中的整体音量
    this.gainNode.connect(this.audioContext.destination);
  }

  toDestination(): MoaMembraneSynth {
    return this;
  }

  triggerAttack(note: string, time?: MoaTimeType): void {
    const startTime = MoaTime.toSeconds(time) ?? this.audioContext.currentTime;

    // 基于Tone.js MembraneSynth的标准实现
    // 使用单个振荡器 + 频率包络 + 幅度包络
    const oscillator = this.audioContext.createOscillator();
    const envelope = this.audioContext.createGain();

    // 连接音频链路
    oscillator.connect(envelope);
    envelope.connect(this.gainNode);

    // 设置振荡器类型为正弦波（Tone.js默认）
    oscillator.type = "sine";

    // 计算基础频率
    const baseFreq = this.noteToFrequency(note);

    // Tone.js MembraneSynth的核心：频率包络
    // 从 baseFreq * octaves 开始，快速下降到 baseFreq
    const octaves = 10; // Tone.js默认值
    const pitchDecay = 0.05; // Tone.js默认值
    const startFreq = baseFreq * octaves;

    // 设置频率包络
    oscillator.frequency.setValueAtTime(startFreq, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      baseFreq,
      startTime + pitchDecay
    );

    // 设置幅度包络 - 基于Tone.js默认值
    const attack = 0.001;
    const decay = 0.4;
    const sustain = 0.01;
    const release = 1.4;

    envelope.gain.setValueAtTime(0, startTime);
    envelope.gain.setValueAtTime(0, startTime);
    envelope.gain.linearRampToValueAtTime(0.8, startTime + attack);
    envelope.gain.exponentialRampToValueAtTime(
      sustain,
      startTime + attack + decay
    );
    envelope.gain.exponentialRampToValueAtTime(
      0.001,
      startTime + attack + decay + release
    );

    // 启动和停止振荡器
    oscillator.start(startTime);
    oscillator.stop(startTime + attack + decay + release);
  }

  triggerRelease(time?: number): void {
    // Membrane synth doesn't need explicit release
  }

  private noteToFrequency(note: string): number {
    // Simple note to frequency conversion
    const noteMap: { [key: string]: number } = {
      C1: 32.7,
      "C#1": 34.6,
      D1: 36.7,
      "D#1": 38.9,
      E1: 41.2,
      F1: 43.7,
      "F#1": 46.2,
      G1: 49.0,
      "G#1": 51.9,
      A1: 55.0,
      "A#1": 58.3,
      B1: 61.7,
    };
    return noteMap[note] || 32.7;
  }
}

class MoaNoiseSynth {
  private audioContext: AudioContext;
  private gainNode: GainNode;
  private options: any;

  constructor(options: any = {}) {
    this.audioContext = MoaAudio.getContext();
    this.options = options;
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = Math.pow(10, (options.volume || 0) / 20);
    this.gainNode.connect(this.audioContext.destination);
  }

  toDestination(): MoaNoiseSynth {
    return this;
  }

  triggerAttack(
    note?: string,
    startTime?: number | string,
    velocity: number = 1
  ): void {
    const currentTime =
      MoaTime.toSeconds(startTime) || this.audioContext.currentTime;
    // 改进的snare实现，增加更多snare特征
    const bufferSize = this.audioContext.sampleRate * 0.2; // 增加到200ms
    const buffer = this.audioContext.createBuffer(
      1,
      bufferSize,
      this.audioContext.sampleRate
    );
    const output = buffer.getChannelData(0);

    // 生成更复杂的噪声，模拟snare的金属丝声
    for (let i = 0; i < bufferSize; i++) {
      // 混合白噪声和粉红噪声
      const whiteNoise = Math.random() * 2 - 1;
      const pinkNoise = (Math.random() * 2 - 1) * 0.7;
      output[i] = whiteNoise * 0.6 + pinkNoise * 0.4;
    }

    const bufferSource = this.audioContext.createBufferSource();
    const envelope = this.audioContext.createGain();

    // 添加高通滤波器，但频率更低，保留更多body
    const highPassFilter = this.audioContext.createBiquadFilter();
    highPassFilter.type = "highpass";
    highPassFilter.frequency.setValueAtTime(80, currentTime); // 降低到80Hz
    highPassFilter.Q.setValueAtTime(0.5, currentTime);

    // 添加带通滤波器增强snare的特征频率
    const bandPassFilter = this.audioContext.createBiquadFilter();
    bandPassFilter.type = "bandpass";
    bandPassFilter.frequency.setValueAtTime(1200, currentTime); // 降低到1200Hz
    bandPassFilter.Q.setValueAtTime(1.5, currentTime);

    bufferSource.buffer = buffer;
    bufferSource.connect(highPassFilter);
    highPassFilter.connect(bandPassFilter);
    bandPassFilter.connect(envelope);
    envelope.connect(this.gainNode);

    // 调整包络，让snare更有punch
    const attack = 0.002; // 稍微慢一点的攻击
    const decay = 0.15; // 更长的衰减
    const sustain = 0.05; // 稍微高一点的持续
    const release = 0.12; // 稍长的释放

    // 设置包络
    envelope.gain.setValueAtTime(0, currentTime);
    envelope.gain.linearRampToValueAtTime(velocity * 2, currentTime + attack); // 增加音量
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(sustain, 0.001),
      currentTime + attack + decay
    );
    envelope.gain.exponentialRampToValueAtTime(
      0.001,
      currentTime + attack + decay + release
    );

    // 启动噪声源
    bufferSource.start(currentTime);
    bufferSource.stop(currentTime + attack + decay + release);
  }
}

class MoaPlayer {
  private synth: MoaSynth | null = null;
  private isPlaying: boolean = false;
  private scheduledTimeouts: NodeJS.Timeout[] = [];
  private data: PlayerData | null = null;

  constructor() {
    this.synth = new MoaSynth({
      preset: appStore.audioPreset.piano,
    }).toDestination();
  }

  setData(data: PlayerData): void {
    this.data = data;
  }

  async play(): Promise<void> {
    if (
      !this.data ||
      this.isPlaying ||
      !this.data.notes ||
      this.data.notes.length === 0
    )
      return;

    await MoaAudio.start();
    this.isPlaying = true;
    this.scheduledTimeouts = [];

    // 计算每个时间单位对应的实际秒数
    const beatDuration = 60 / this.data.bpm / 2; // 一拍的秒数，默认半拍

    // 播放所有音符
    this.data.notes.forEach((note) => {
      const startTime = note.time * beatDuration * 1000; // 转换为毫秒
      const duration = note.duration * beatDuration; // 音符持续时间（秒）

      const timeout = setTimeout(() => {
        if (this.synth && this.isPlaying) {
          this.synth.triggerAttackRelease(note.value, duration);
        }
      }, startTime);

      this.scheduledTimeouts.push(timeout);
    });

    // 播放结束后重置状态
    const totalDuration = this.data.timeLength * beatDuration * 1000;
    const endTimeout = setTimeout(() => {
      this.stop();
    }, totalDuration);
    this.scheduledTimeouts.push(endTimeout);
  }

  stop(): void {
    this.isPlaying = false;
    this.scheduledTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.scheduledTimeouts = [];
  }

  dispose(): void {
    this.stop();
    if (this.synth) {
      this.synth = null;
    }
  }
}

// Main MoaTone object that mimics Tone.js API
export const MoaTone = {
  Synth: MoaSynth,
  // PolySynth已移除，使用Synth代替，因为MoaSynth已支持多音符播放
  MembraneSynth: MoaMembraneSynth,
  NoiseSynth: MoaNoiseSynth,
  Transport: MoaTransport,
  Time: MoaTime,
  Player: MoaPlayer,
  soundPresets,
  start: MoaAudio.start,
  now: MoaAudio.now,
  context: {
    get state() {
      return MoaAudio.getContext().state;
    },
    suspend: () => MoaAudio.getContext().suspend(),
    resume: () => MoaAudio.getContext().resume(),
  },
  // Transport methods for compatibility
  scheduleRepeat: (
    callback: (time: number) => void,
    interval: string | number
  ) => {
    return MoaTransport.scheduleRepeat(callback, interval);
  },
  // Schedule method for compatibility
  schedule: (callback: (time: number) => void, time: number) => {
    return MoaTransport.schedule(callback, time);
  },
};

export {
  MoaSynth,
  MoaMembraneSynth,
  MoaNoiseSynth,
  MoaTransport,
  MoaTime,
  MoaPlayer,
};
export default MoaTone;
