import { getAbsoluteInterval, parseNote } from "./calc";
import { MoaAudio } from "./MoaTone";
import { IndexedDBCache } from "./IndexedDBCache";

export interface AudioNodeChain {
  output: AudioNode;
  start: (when?: number) => void;
  stop: (when?: number) => void;
  setFrequency: (frequency: number) => void;
  cleanup?: () => void;
}

export interface SoundConfig {
  createNodes: (
    audioContext: AudioContext,
    resourcePool: AudioResourcePool
  ) => AudioNodeChain;
  requiredResources: string[];
}

export interface SoundConfigs {
  [key: string]: SoundConfig;
}
export interface AudioSample {
  note: string;
  url: string;
  buffer?: AudioBuffer;
  loading: boolean;
  error?: string;
}

export interface AudioResource {
  id: string;
  samples: { [note: string]: string }; // note -> url mapping
  sampleBuffers: Map<string, AudioBuffer>; // note -> buffer mapping
  loading: boolean;
  error?: string;
}

export interface ResourceStatus {
  ready: boolean;
  loading: boolean;
  error?: string;
}

export interface AudioResourcePool {
  getBuffer: (id: string, note?: string) => AudioBuffer | null;
  getSampleBuffer: (id: string, note: string) => AudioBuffer | null;
  getStatus: (id: string) => ResourceStatus;
  loadResources: (ids: string[]) => Promise<void>;
  loadCachedResources: (ids: string[]) => Promise<void>;
  isResourceCached: (id: string) => Promise<boolean>;
  clearUnusedResources: (keepIds: string[]) => void;
  getLoadedResourceIds: () => string[];
  getAllResourceIds: () => string[];
  getClosestSample: (
    id: string,
    targetNote: string
  ) => { note: string; buffer: AudioBuffer } | null;
  initialize: () => Promise<void>;
}

export class AudioResourceManager implements AudioResourcePool {
  private resources = new Map<string, AudioResource>();
  private audioContext: AudioContext | null = null;
  private cache: IndexedDBCache | null = null;
  private readonly CACHE_NAME = "audio-samples-cache";
  private isInitialized = false;

  constructor() {
    // 预定义所有可能的资源
    this.defineResource({
      id: "piano",
      samples: {
        A3: "https://luv-club.oss-cn-chengdu.aliyuncs.com/piano/A3.wav",
        A4: "https://luv-club.oss-cn-chengdu.aliyuncs.com/piano/A4.wav",
        A5: "https://luv-club.oss-cn-chengdu.aliyuncs.com/piano/A5.wav",
      },
    });

    this.defineResource({
      id: "guitar",
      samples: {
        Db4: "/audios/guitar/C4.wav",
      },
    });

    this.defineResource({
      id: "jazz-guitar",
      samples: {
        C4: "/audios/jazz-guitar/C.wav",
      },
    });

    this.defineResource({
      id: "marimba",
      samples: {
        C3: "/audios/marimba/C3.wav",
        C4: "/audios/marimba/C4.wav",
      },
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 初始化音频上下文
      this.audioContext = MoaAudio.getContext();

      // 初始化IndexedDB缓存
      this.cache = new IndexedDBCache("audio_cache_db", 1);
      await this.cache.initialize();
      console.log("IndexedDB audio cache initialized successfully");

      this.isInitialized = true;
      console.log("AudioResourceManager initialized successfully");
    } catch (error) {
      console.error("Failed to initialize AudioResourceManager:", error);
      throw error;
    }
  }

  defineResource(resource: {
    id: string;
    samples: { [note: string]: string };
  }) {
    this.resources.set(resource.id, {
      id: resource.id,
      samples: resource.samples,
      sampleBuffers: new Map(),
      loading: false,
    });
  }

  getBuffer(id: string, note?: string): AudioBuffer | null {
    const resource = this.resources.get(id);
    if (!resource) return null;

    if (note) {
      return resource.sampleBuffers.get(note) || null;
    }

    // 如果没有指定音符，返回第一个可用的采样
    const firstBuffer = Array.from(resource.sampleBuffers.values())[0];
    return firstBuffer || null;
  }

  getSampleBuffer(id: string, note: string): AudioBuffer | null {
    const resource = this.resources.get(id);
    return resource?.sampleBuffers.get(note) || null;
  }

  getStatus(id: string): ResourceStatus {
    const resource = this.resources.get(id);
    if (!resource) {
      return { ready: false, loading: false, error: "Resource not found" };
    }

    const hasLoadedSamples = resource.sampleBuffers.size > 0;
    return {
      ready: hasLoadedSamples && !resource.loading,
      loading: resource.loading,
      error: resource.error,
    };
  }

  async loadResources(ids: string[]): Promise<void> {
    const loadPromises = ids
      .filter((id) => !this.getStatus(id).ready) // 只加载未就绪的资源
      .map((id) => this.loadResourceSamples(id));

    await Promise.all(loadPromises);
  }

  // 仅加载已缓存的资源
  async loadCachedResources(ids: string[]): Promise<void> {
    const cachedIds = [];
    for (const id of ids) {
      if (!this.getStatus(id).ready && (await this.isResourceCached(id))) {
        cachedIds.push(id);
      }
    }

    if (cachedIds.length > 0) {
      const loadPromises = cachedIds.map((id) =>
        this.loadCachedResourceSamples(id)
      );
      await Promise.all(loadPromises);
    }
  }

  // 检查资源是否已缓存
  async isResourceCached(id: string): Promise<boolean> {
    const resource = this.resources.get(id);
    if (!resource || !this.cache) {
      return false;
    }

    try {
      // 检查所有采样是否都已缓存
      const cacheChecks = Object.keys(resource.samples).map(async (note) => {
        const cacheKey = `${id}-${note}`;
        const cachedResponse = await this.cache.match(cacheKey);
        return cachedResponse !== undefined;
      });

      const results = await Promise.all(cacheChecks);
      return results.every((cached) => cached);
    } catch (error) {
      console.warn(`Failed to check cache for resource ${id}:`, error);
      return false;
    }
  }

  // 清理未使用的资源以节省内存
  clearUnusedResources(keepIds: string[]): void {
    const keepSet = new Set(keepIds);

    for (const [id, resource] of this.resources.entries()) {
      if (!keepSet.has(id) && resource.sampleBuffers.size > 0) {
        console.log(`Clearing unused resource: ${id}`);
        resource.sampleBuffers.clear();
        resource.loading = false;
        resource.error = undefined;
      }
    }
  }

  // 获取已加载的资源ID列表
  getLoadedResourceIds(): string[] {
    const loadedIds: string[] = [];
    for (const [id, resource] of this.resources.entries()) {
      if (resource.sampleBuffers.size > 0) {
        loadedIds.push(id);
      }
    }
    return loadedIds;
  }

  // 获取所有已定义的资源ID列表
  getAllResourceIds(): string[] {
    return Array.from(this.resources.keys());
  }

  /**
   * 清除缓存
   */
  async clearCache(): Promise<void> {
    // 1. 清除内存中已加载的音频资源
    for (const [id, resource] of this.resources.entries()) {
      if (resource.sampleBuffers.size > 0) {
        console.log(`Clearing loaded resource from memory: ${id}`);
        resource.sampleBuffers.clear();
        resource.loading = false;
        resource.error = undefined;
      }
    }

    // 2. 清除IndexedDB缓存
    if (this.cache) {
      // 这里我们简化处理，直接重新创建数据库
      this.cache.close();

      // 删除数据库并重新创建
      return new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("audio_cache_db");
        deleteRequest.onsuccess = async () => {
          this.cache = new IndexedDBCache("audio_cache_db", 1);
          await this.cache.initialize();
          resolve();
        };
        deleteRequest.onerror = () => {
          reject(new Error("Failed to delete IndexedDB"));
        };
      });
    }
  }

  /**
   * 获取缓存信息
   */
  async getCacheInfo(): Promise<{
    totalEntries: number;
    totalSize: number;
    oldestEntry?: number;
    newestEntry?: number;
  }> {
    if (!this.cache) {
      return { totalEntries: 0, totalSize: 0 };
    }

    try {
      return await this.cache.getCacheInfo();
    } catch (error) {
      console.error("Failed to get cache info:", error);
      return { totalEntries: 0, totalSize: 0 };
    }
  }

  // 获取最接近目标音符的采样
  getClosestSample(
    id: string,
    targetNote: string
  ): { note: string; buffer: AudioBuffer } | null {
    const resource = this.resources.get(id);
    if (!resource) return null;

    // 如果有完全匹配的采样，直接返回
    const exactBuffer = resource.sampleBuffers.get(targetNote);
    if (exactBuffer) {
      return { note: targetNote, buffer: exactBuffer };
    }

    // 找最接近的采样（基于音高距离计算）
    const availableNotes = Array.from(resource.sampleBuffers.keys());
    if (availableNotes.length > 0) {
      // 将音符转换为MIDI音高进行距离计算
      const parsedTarget = parseNote(targetNote);
      const targetMidi = getAbsoluteInterval({
        name: parsedTarget.note,
        octave: parsedTarget.octave,
      });
      let closestNote = availableNotes[0];
      const parsedFirst = parseNote(availableNotes[0]);
      let minDistance = Math.abs(
        getAbsoluteInterval({
          name: parsedFirst.note,
          octave: parsedFirst.octave,
        }) - targetMidi
      );

      for (const note of availableNotes) {
        const parsedNote = parseNote(note);
        const distance = Math.abs(
          getAbsoluteInterval({
            name: parsedNote.note,
            octave: parsedNote.octave,
          }) - targetMidi
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestNote = note;
        }
      }

      const buffer = resource.sampleBuffers.get(closestNote);
      if (buffer) {
        return { note: closestNote, buffer };
      }
    }

    return null;
  }

  private async loadCachedResourceSamples(id: string): Promise<void> {
    const resource = this.resources.get(id);
    if (!resource) {
      throw new Error(`Resource not found: ${id}`);
    }

    if (resource.sampleBuffers.size > 0 || resource.loading) {
      return; // 已加载或正在加载
    }

    if (!this.audioContext) {
      throw new Error("AudioContext not initialized");
    }

    resource.loading = true;
    resource.error = undefined;

    try {
      console.log(`Loading cached audio resource samples: ${id}`);

      // 并行加载所有已缓存的采样
      const samplePromises = Object.entries(resource.samples).map(
        async ([note, url]) => {
          try {
            const cacheKey = `${id}-${note}`;
            if (this.cache) {
              const cachedResponse = await this.cache.match(cacheKey);
              if (cachedResponse) {
                console.log(`Loading ${cacheKey} from cache`);
                const arrayBuffer = await cachedResponse.arrayBuffer();
                const audioBuffer =
                  await this.audioContext!.decodeAudioData(arrayBuffer);
                resource.sampleBuffers.set(note, audioBuffer);

                console.log(
                  `Cached sample loaded successfully: ${id}/${note}`,
                  {
                    duration: audioBuffer.duration,
                    sampleRate: audioBuffer.sampleRate,
                    channels: audioBuffer.numberOfChannels,
                  }
                );
              }
            }
          } catch (error) {
            console.error(`Failed to load cached sample: ${id}/${note}`, error);
            // 继续加载其他采样，不抛出错误
          }
        }
      );

      await Promise.all(samplePromises);
      resource.loading = false;

      if (resource.sampleBuffers.size === 0) {
        throw new Error(`No cached samples found for resource: ${id}`);
      }

      console.log(
        `Cached audio resource loaded successfully: ${id} (${resource.sampleBuffers.size} samples)`
      );
    } catch (error) {
      resource.loading = false;
      resource.error = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to load cached audio resource: ${id}`, error);
      throw error;
    }
  }

  private async loadResourceSamples(id: string): Promise<void> {
    const resource = this.resources.get(id);
    if (!resource) {
      throw new Error(`Resource not found: ${id}`);
    }

    if (resource.sampleBuffers.size > 0 || resource.loading) {
      return; // 已加载或正在加载
    }

    if (!this.audioContext) {
      throw new Error("AudioContext not initialized");
    }

    resource.loading = true;
    resource.error = undefined;

    try {
      console.log(`Loading audio resource samples: ${id}`);

      // 并行加载所有采样
      const samplePromises = Object.entries(resource.samples).map(
        async ([note, url]) => {
          try {
            const audioBuffer = await this.fetchAndDecodeAudioWithCache(
              url,
              `${id}-${note}`
            );
            resource.sampleBuffers.set(note, audioBuffer);

            console.log(`Sample loaded successfully: ${id}/${note}`, {
              duration: audioBuffer.duration,
              sampleRate: audioBuffer.sampleRate,
              channels: audioBuffer.numberOfChannels,
            });
          } catch (error) {
            console.error(`Failed to load sample: ${id}/${note}`, error);
            // 继续加载其他采样，不抛出错误
          }
        }
      );

      await Promise.all(samplePromises);
      resource.loading = false;

      if (resource.sampleBuffers.size === 0) {
        throw new Error(`No samples loaded for resource: ${id}`);
      }

      console.log(
        `Audio resource loaded successfully: ${id} (${resource.sampleBuffers.size} samples)`
      );
    } catch (error) {
      resource.loading = false;
      resource.error = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to load audio resource: ${id}`, error);
      throw error;
    }
  }

  private async fetchAndDecodeAudioWithCache(
    url: string,
    cacheKey: string
  ): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error("AudioContext not initialized");
    }

    let arrayBuffer: ArrayBuffer;

    // 尝试从缓存获取
    if (this.cache) {
      try {
        const cachedResponse = await this.cache.match(cacheKey);
        if (cachedResponse) {
          console.log(`Loading ${cacheKey} from cache`);
          arrayBuffer = await cachedResponse.arrayBuffer();
        } else {
          // 从网络获取并缓存
          arrayBuffer = await this.fetchAndCacheAudio(url, cacheKey);
        }
      } catch (error) {
        console.warn(
          `Cache operation failed for ${cacheKey}, falling back to network:`,
          error
        );
        arrayBuffer = await this.fetchAudioFromNetwork(url);
      }
    } else {
      // 直接从网络获取
      arrayBuffer = await this.fetchAudioFromNetwork(url);
    }

    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  private async fetchAndCacheAudio(
    url: string,
    cacheKey: string
  ): Promise<ArrayBuffer> {
    console.log(`Fetching ${cacheKey} from network and caching`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "audio/wav,audio/*,*/*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new Error("Empty audio file");
    }

    // 存储到缓存
    if (this.cache) {
      try {
        const cacheResponse = new Response(arrayBuffer.slice(0), {
          headers: {
            "Content-Type": "audio/wav",
            "Cache-Control": "max-age=31536000", // 1年
          },
        });
        await this.cache.put(cacheKey, cacheResponse);
      } catch (error) {
        console.warn(`Failed to cache ${cacheKey}:`, error);
      }
    }

    return arrayBuffer;
  }

  private async fetchAudioFromNetwork(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "audio/wav,audio/*,*/*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new Error("Empty audio file");
    }

    return arrayBuffer;
  }
}

// 全局实例
export const audioResourceManager = new AudioResourceManager();
