import { apiState } from "@/services/state";
import { resolve } from "path";
import { proxy, ref, subscribe } from "valtio";
import { message } from "antd";
import {
  audioResourceManager,
  AudioResourceManager,
} from "@/utils/AudioResourceManager";
import { db } from "@/utils/indexedDB";
import { soundPresets } from "@/utils/soundPresets";
import { subscribeKey } from "valtio/utils";

export interface AppState {
  user: {
    id: string;
    name: string;
    token?: string;
  };
  isInit: boolean;
  isPresetInit: boolean;
  syncing: boolean;
  resourceManager: AudioResourceManager;
  audioPreset: {
    guitar: keyof typeof soundPresets;
    piano: keyof typeof soundPresets;
  };
  practiceSkin: "default" | "roshengy";
  nightMode: boolean;
}

export const DEFAULT_AUDIO_PRESET: AppState["audioPreset"] = {
  guitar: "guitar",
  piano: "piano",
};

const ISSERVER = typeof window === "undefined";
const auth = ISSERVER ? {} : (JSON.parse(localStorage.getItem("auth")) ?? {});
apiState.authToken = auth.token;

const DEFAULT_AUDIO_PRESET_TOAST_KEY = "default-audio-preset-loading";

const getDefaultAudioPresetMessage = (
  key: "loading" | "description" | "error"
) => {
  const locale =
    typeof window !== "undefined" &&
    localStorage.getItem("NEXT_LOCALE") === "en"
      ? "en"
      : "zh";

  const messages = {
    zh: {
      loading: "正在准备默认音色",
      description: "首次使用会先加载钢琴和吉他音色资源",
      error: "默认音色加载失败",
    },
    en: {
      loading: "Preparing default timbres",
      description: "First use will load piano and guitar timbre resources",
      error: "Failed to load default timbres",
    },
  } as const;

  return messages[locale][key];
};

// 创建全局应用状态
export const appStore = proxy<AppState>({
  user: {
    id: auth?.id || "",
    name: auth?.name || "",
    token: auth?.token || "",
  },
  isInit: false,
  isPresetInit: false,
  syncing: false,
  resourceManager: ref(
    typeof window !== "undefined"
      ? audioResourceManager
      : new AudioResourceManager()
  ),
  audioPreset: {
    guitar: "sine",
    piano: "sine",
  },
  practiceSkin:
    typeof window !== "undefined"
      ? (localStorage.getItem("practiceSkin") as any) || "default"
      : "default",
  nightMode:
    typeof window !== "undefined"
      ? localStorage.getItem("nightMode") === "true"
      : false,
});

// 将状态暴露到全局，供API拦截器使用
if (typeof window !== "undefined") {
  (window as any).globalState = appStore;

  subscribeKey(appStore, "nightMode", (val) => {
    localStorage.setItem("nightMode", String(val));
  });
}

// 订阅audioPreset变化，保存到IndexedDB
if (typeof window !== "undefined") {
  subscribeKey(
    appStore,
    "audioPreset",
    () => {
      if (!appStore.isPresetInit) return;

      // 保存audioPreset到IndexedDB
      db.setItem("audioPreset", JSON.stringify(appStore.audioPreset)).catch(
        (error) => {
          console.error("Failed to save audioPreset to IndexedDB:", error);
        }
      );
    },
    true
  );
}

if (typeof window !== "undefined") {
  subscribeKey(
    appStore,
    "isInit",
    async () => {
      if (appStore.isInit) {
        let shouldPersistDefaultAudioPreset = false;

        try {
          appStore.isPresetInit = false;
          const savedPreset = await db.getItem("audioPreset");
          if (savedPreset) {
            const parsedPreset = JSON.parse(savedPreset);
            appStore.audioPreset = parsedPreset;
          } else {
            message.loading({
              key: DEFAULT_AUDIO_PRESET_TOAST_KEY,
              className: "default-audio-preset-toast",
              content: `${getDefaultAudioPresetMessage("loading")} · ${getDefaultAudioPresetMessage("description")}`,
              duration: 0,
            });

            await appStore.resourceManager.initialize();
            const defaultResourceIds = Array.from(
              new Set(
                Object.values(DEFAULT_AUDIO_PRESET).flatMap(
                  (preset) => soundPresets[preset].requiredResources
                )
              )
            );

            if (defaultResourceIds.length > 0) {
              await appStore.resourceManager.loadResources(defaultResourceIds);
            }

            appStore.audioPreset.piano = DEFAULT_AUDIO_PRESET.piano;
            appStore.audioPreset.guitar = DEFAULT_AUDIO_PRESET.guitar;
            shouldPersistDefaultAudioPreset = true;
            message.destroy(DEFAULT_AUDIO_PRESET_TOAST_KEY);
          }
        } catch (error) {
          message.destroy(DEFAULT_AUDIO_PRESET_TOAST_KEY);
          message.error(getDefaultAudioPresetMessage("error"));
          console.error("Failed to load audioPreset from IndexedDB:", error);
        } finally {
          appStore.isPresetInit = true;
        }

        if (shouldPersistDefaultAudioPreset) {
          db.setItem("audioPreset", JSON.stringify(DEFAULT_AUDIO_PRESET)).catch(
            (error) => {
              console.error(
                "Failed to initialize default audioPreset in IndexedDB:",
                error
              );
            }
          );
        }
      }
    },
    true
  );
}

if (typeof window !== "undefined") {
  subscribeKey(
    appStore,
    "practiceSkin",
    () => {
      try {
        localStorage.setItem("practiceSkin", appStore.practiceSkin);
      } catch {}
    },
    true
  );
}
