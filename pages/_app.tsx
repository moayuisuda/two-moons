// import "../styles/antd.css";
import "../theme/global.scss";

import type { AppProps } from "next/app";
import { Button, ConfigProvider, Divider, theme } from "antd";
import { token } from "../theme/token";
import { Header } from "@/components/Header";
import { UniversalSearchFloat } from "@/components/UniversalSearchFloat";
import { createContext, useEffect, useState, useRef } from "react";
import { api } from "@/services/api";
import { useSnapshot } from "valtio";
import { apiState } from "@/services/state";
import { appStore } from "@/stores/store";
import Head from "next/head";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import Script from "next/script";
import { NextPageWithLayout } from "@/typings/platform";
import { saveLastRoute, shouldRedirectToLastRoute } from "@/utils/routeMemory";
import { isTokenExpiringSoon } from "@/utils/tokenUtils";
import { dbManager, db } from "@/utils/indexedDB";
import { GlobalPiano } from "@/components/GlobalPiano";
import { GlobalShare } from "@/components/GlobalShare";
import { checkPWA, isBrowser } from "@/utils/env";
import { MoaAudio } from "@/utils/MoaTone";
import { Footer } from "@/components/Footer";
import { appWithTranslation } from "next-i18next";
import { useTranslation } from "next-i18next";
import { planActions } from "@/stores/planStore";
import { SafeArea } from "capacitor-plugin-safe-area";
import { App } from "@capacitor/app";
import { message } from "antd";
import { compareVersions, isExportBuildMode } from "@/utils/version";

// 开发环境下导入 vConsole
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  // import("vconsole").then((VConsole) => {
  // new VConsole.default();
  // });
}

const isAudiotimerBlock = async () => {
  await MoaAudio.getContext().resume();

  return new Promise((res) => {
    const curr = MoaAudio.getContext().currentTime;
    setTimeout(() => {
      const newCurr = MoaAudio.getContext().currentTime;
      if (newCurr === 0) res(false);
      console.log(JSON.stringify({ curr, newCurr }));
      if (curr === newCurr) res(true);
      return res(false);
    }, 50);
  });
};

export const StateContext = createContext({
  user: {
    id: "",
    name: "",
  } as {
    id?: string;
    name?: string;
  },
});

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

function MyApp({ Component, pageProps, router }: AppPropsWithLayout) {
  const isHome = router.route === "/";
  const [loading, setLoading] = useState(true);

  // Ref to access current router in callbacks
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const { user, nightMode } = useSnapshot(appStore);
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language;

  useEffect(() => {
    if (nightMode) {
      document.documentElement.classList.add("night-mode");
    } else {
      document.documentElement.classList.remove("night-mode");
    }
  }, [nightMode]);

  useEffect(() => {
    // 仅客户端（Capacitor）才执行
    // @ts-ignore
    if (typeof window !== "undefined" && window.Capacitor) {
      (async () => {
        const { insets } = await SafeArea.getSafeAreaInsets();
        injectVars(insets);
        // 实时更新
        SafeArea.addListener("safeAreaChanged", ({ insets }) =>
          injectVars(insets)
        );
      })();

      // Handle back button
      App.addListener("backButton", ({ canGoBack }) => {
        const currentRoute = routerRef.current;
        if (currentRoute.route !== "/") {
          currentRoute.back();
        } else {
          App.exitApp();
        }
      });
    }

    return () => {
      // @ts-ignore
      if (typeof window !== "undefined" && window.Capacitor) {
        App.removeAllListeners();
      }
    };
  }, []);
  // 注入 CSS 变量
  function injectVars(insets) {
    message.config({
      top: insets.top,
    });
    for (const [key, value] of Object.entries(insets)) {
      document.documentElement.style.setProperty(
        `--safe-area-inset-${key}`,
        `${value}px`
      );
    }
  }

  // 根据语言设置 Ant Design 的 locale
  const antdLocale = locale === "en" ? enUS : zhCN;
  // 检测是否为iOS系统
  const isIOS = () => {
    if (!isBrowser()) return false;
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;

    // 检测iOS设备（包括桌面模式）
    if (/iPad|iPhone|iPod/.test(userAgent)) {
      return true;
    }

    // iOS 13+ 桌面模式检测：用户代理显示为Mac但平台仍为iOS设备
    // 或者检测触摸支持 + Mac平台（可能是iPad桌面模式）
    if (
      (platform && /iPhone|iPod|iPad/.test(platform)) ||
      (userAgent.includes("Mac OS X") &&
        "maxTouchPoints" in navigator &&
        navigator.maxTouchPoints > 0)
    ) {
      return true;
    }

    return false;
  };

  // 主动刷新token
  const refreshTokenIfNeeded = async () => {
    if (apiState.authToken && isTokenExpiringSoon(apiState.authToken)) {
      try {
        const response = await api.post("/user/refresh-token");
        const { token, name, id, refreshed } = response;

        if (refreshed) {
          apiState.authToken = token;
          localStorage.setItem("auth", JSON.stringify({ token, name, id }));
        }
      } catch (error) {
        console.log("主动刷新token失败:", error);
        // 刷新失败时清除认证信息
        apiState.authToken = "";
        appStore.user = { id: "", name: "" };
        localStorage.removeItem("auth");
      }
    }
  };

  // 初始化和认证
  useEffect(() => {
    api.post("/get-ai-token").then((res) => {
      apiState.moonToken = (res as any).token;
    });

    appStore.isInit = false;

    if (user.token) {
      try {
        // 用户已登录，触发数据同步
        dbManager
          .initSync()
          .catch((error) => {
            console.error("Failed to sync data on login:", error);
          })
          .finally(() => {
            appStore.isInit = true;
            planActions.init();
          });
      } catch (e) {
        localStorage.removeItem("auth");
      }
    } else {
      appStore.isInit = true;
      planActions.init();
    }
  }, [user.token]);

  // 定时检查token过期状态
  useEffect(() => {
    if (!apiState.authToken) return;

    // 立即检查一次
    refreshTokenIfNeeded();

    // 每5分钟检查一次
    const interval = setInterval(refreshTokenIfNeeded, 5 * 1000);

    return () => clearInterval(interval);
  }, [user.token]);

  // 路由记忆和自动重定向
  useEffect(() => {
    const redirectRoute = shouldRedirectToLastRoute(router.asPath);
    if (redirectRoute) {
      router.replace(redirectRoute).finally(() => {
        setLoading(false);
      });
      return;
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const handleRouteChangeComplete = (url) => {
      console.log("Route change complete:", url);
      saveLastRoute(url);
    };

    router.events.on("routeChangeComplete", handleRouteChangeComplete);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChangeComplete);
    };
  }, [router]);

  useEffect(() => {
    const initializeAudioResources = async () => {
      await appStore.resourceManager.initialize();
      const allResourceIds = appStore.resourceManager.getAllResourceIds();
      await appStore.resourceManager.loadCachedResources(allResourceIds);
    };

    initializeAudioResources().catch(console.error);
  }, []);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        if (!isExportBuildMode) return;
        const res = await fetch(
          "https://my-json-server.typicode.com/moayuisuda/config/presets/version"
        );
        const data = await res.json();
        const latest = String(data?.latest || "");
        const current = String(process.env.NEXT_PUBLIC_VERSION || "");
        if (!latest || !current) return;
        if (compareVersions(current, latest) < 0) {
          message.warning(
            <span>
              {t("检测到新版本，建议重新")}
              <a
                href="https://hk.gh-proxy.org/https://raw.githubusercontent.com/moayuisuda/two-moons-release/refs/heads/main/moonbox-latest.apk"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("安装应用")}
              </a>
            </span>,
            5
          );
        }
      } catch (e) {}
    };
    checkVersion();
  }, []);

  // 音频重新激活状态
  const [showAudioReactivation, setShowAudioReactivation] = useState(false);

  // 页面可见性检测，从后台重新打开时触发相应逻辑
  useEffect(() => {
    if (!isBrowser()) return;

    let wasHidden = false;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 页面隐藏时标记状态
        wasHidden = true;
      } else {
        // 页面显示时检查是否从后台切回
        if (wasHidden) {
          if (isIOS()) {
            // iOS设备显示音频重新激活提示
            setShowAudioReactivation(true);
          } else {
            // 其他设备直接重新加载
            // router.reload();
          }
          wasHidden = false;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // 处理音频重新激活
  const handleAudioReactivation = async () => {
    try {
      const blocked = await isAudiotimerBlock();
      if (blocked) {
        router.reload();
      } else {
        setShowAudioReactivation(false);
      }
    } catch (error) {
      console.error(t("音频重新激活失败:"), error);
      // 如果音频重新激活失败，则重新加载页面
      router.reload();
    }
  };

  return (
    <ConfigProvider theme={{ token, hashed: false }} locale={antdLocale}>
      <StateContext.Provider value={appStore}>
        <Head>
          {/* <script type="text/javascript" src="//api.tongjiniao.com/c?_=622560626766118912" async></script> */}
          <meta
            name="viewport"
            content="width=device-width,initial-scale=1.0,user-scalable=no"
          />
          <meta
            name="description"
            content={t(
              "月盒MoonBox基于交互式教程与AI音乐助手，以全新方式来进行基础乐理教学。包含各种音乐实用工具，如和弦编辑，乐句记录，视唱练耳。"
            )}
          />

          {/* Google Fonts */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin=""
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap"
            rel="stylesheet"
          />

          {/* PWA Meta Tags */}
          <link rel="manifest" href="/manifest.json" />
          <meta name="theme-color" content="#000000" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="default"
          />
          <meta name="apple-mobile-web-app-title" content="Luv Club" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="msapplication-TileColor" content="#000000" />
          <meta name="msapplication-tap-highlight" content="no" />

          {/* Icons */}
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
          <link rel="manifest" href="/manifest.json" />

          <title>{t("月盒MoonBox")}</title>
        </Head>
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-77NRWLH657"
        ></Script>
        <Script id="analysis">
          {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'G-77NRWLH657');
        `}
        </Script>
        <Script id="disable-scroll-auto">
          {`
            if(location.href.indexOf('#')) {
                if (history.scrollRestoration) {
                  history.scrollRestoration = 'manual';
                }
              }
          `}
        </Script>

        <div
          style={{
            // fontFamily: `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans',sans-serif,'Apple Color Emoji','Segoe UI Emoji','Segoe UI Symbol','Noto Color Emoji'`,
            height: "100vh",
            width: "100vw",
            position: "fixed",
            zIndex: 999,
            top: 0,
            opacity: 0.9,
            left: 0,
            backgroundColor: "white",
            display: loading ? "flex" : "none",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto",
          }}
        >
          {t("版本升级中...")} (ᕑᗢᓫ∗)˒🌙
          <br />
          {t("仅第一次会加载较慢")}
          <br />
          {t("加载过久可尝试刷新或重启app")}
        </div>
        <div
          className="root"
          style={{
            // height: checkPWA() ? "100vh" : "",
            // overflowY: "auto",
            // overscrollBehavior: "none",
          }}
        >
          <Header />
          <div
            style={{
              height: `calc(2.25rem + var(--safe-area-inset-top))`,
            }}
          ></div>
          {Component.getLayout ? (
            Component.getLayout(
              <Component key={router.asPath} {...pageProps} />
            )
          ) : (
            <Component key={router.asPath} {...pageProps} />
          )}
          <UniversalSearchFloat />
          <GlobalShare />
          <GlobalPiano />
          <div className="h-20"></div>
          <Footer />
        </div>

        {/* iOS音频重新激活蒙层 */}
        {showAudioReactivation && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              color: "white",
              flexDirection: "column",
              gap: "20px",
              padding: "20px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>
              {t("音频需要重新激活")}
            </div>
            <div style={{ fontSize: "14px", opacity: 0.8 }}>
              {t("为确保音频功能正常工作，请重新激活音频")}
            </div>
            <Button size="large" onClick={handleAudioReactivation}>
              {t("点击重新激活音频")}
            </Button>
          </div>
        )}
      </StateContext.Provider>
    </ConfigProvider>
  );
}

export default appWithTranslation(MyApp);
