import React from "react";
import Link from "next/link";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { GetStaticProps } from "next";
import TypewriterText from "@/components/TypewriterText";
import { Button, Divider } from "antd";
import {
  BookOutlined,
  RocketOutlined,
  SoundOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import { OneSong } from "@/components/OneSong";
import { useSnapshot } from "valtio";
import { appStore } from "@/stores/store";
import { useMemo } from "react";
import { planStore, ModuleGoal, ModuleType } from "@/stores/planStore";
import { Card } from "antd";
import { useRouter } from "next/router";
import { isMobile } from "@/utils/env";

export default function Home() {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language;
  const { user } = useSnapshot(appStore);
  const router = useRouter();
  const snap = useSnapshot(planStore);

  const currentPlan = useMemo(() => {
    return snap.plans.find((p) => p.id === (snap.currentPlanId || "")) || null;
  }, [snap.plans, snap.currentPlanId]);
  console.log(currentPlan, snap.plans, snap.currentPlanId);

  const goToModule = (type: ModuleType) => {
    if (type === "guitar.note")
      router.push("/guitar-practice?mod=identification");
    else if (type === "guitar.interval")
      router.push("/guitar-practice?mod=interval");
    else if (type === "sings.chord") router.push("/practice#harmony");
    else if (type === "sings.interval") router.push("/practice#interval");
    else if (type === "sings.melody") router.push("/practice#melody");
    else if (type === "sings.staff") router.push("/practice#staff-note");
    else if (type === "sings.progression")
      router.push("/practice#chord-progression");
  };

  return (
    <div>
      {/* {locale === "zh" && <OneSong />} */}
      <main className="bg-white pt-12 flex flex-col items-center justify-start md:justify-center">
        {/* 主标题 */}
        <div
          className="text-center"
          style={{
            marginTop: isMobile() ? 0 : "10vh",
          }}
        >
          <div className="relative">
            <div className="flex justify-center">
              <h1 className="text-5xl break-all text-left md:text-8xl font-bold text-primary mb-8 tracking-tight relative bg-white px-8 break-words">
                {`Hi, ${user.name || t("今天学点什么？")}`}
              </h1>
            </div>

            {/* 今日练习 */}
            {currentPlan && (
              <div>
                <h2 className="text-center">今日练习🌙</h2>
                <div className="mt-4 mb-8 flex flex-wrap gap-4 justify-center">
                  {currentPlan.modules.map((m: ModuleGoal) => (
                    <Card
                      key={`${currentPlan.id}-${m.type}`}
                      onClick={() => goToModule(m.type)}
                      style={{
                        backgroundColor: currentPlan?.progress[m.type]
                          ?.completed
                          ? "#e6ffed"
                          : "#f5f5f5",
                        border: "none",
                        cursor: "pointer",
                        minWidth: 220,
                      }}
                    >
                      <div className="flex flex-col">
                        <span>
                          {m.type === "guitar.note"
                            ? "指板音符"
                            : m.type === "guitar.interval"
                              ? "指板音程"
                              : m.type === "sings.chord"
                                ? "和弦辨认"
                                : m.type === "sings.interval"
                                  ? "音程辨认"
                                  : m.type === "sings.staff"
                                    ? "五线谱"
                                    : m.type === "sings.progression"
                                      ? "和弦进行"
                                      : "旋律辨认"}
                        </span>
                        <span className="text-gray-500 text-sm">{`${m.questions}题 / ${m.accuracy}%`}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* <h2 className="text-primar">{t("你可以在月盒")}</h2> */}
          </div>

          {/* 打字效果区域 */}
          <div className="h-20 md:h-32 flex items-center justify-center">
            <TypewriterText className="text-center" />
          </div>
        </div>

        {/* 分隔线 */}
        <div className="mb-6 md:mb-6"></div>

        {/* 行动按钮 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 w-full max-w-6xl px-4">
          {[
            {
              href: "/post/basic/a-song",
              key: "教程",
              description: "从零开始的音乐之旅",
              icon: <BookOutlined className="text-xl" />,
            },
            {
              href: "/practice",
              key: "练习",
              description: "每日精进，积少成多",
              icon: <RocketOutlined className="text-xl" />,
            },
            {
              href: "/chord",
              key: "和弦",
              description: "探索和声的无限可能",
              icon: <SoundOutlined className="text-xl" />,
            },
            {
              href: "/market",
              key: "市场",
              description: "发现更多优质内容",
              icon: <ShopOutlined className="text-xl" />,
            },
          ].map(({ href, key, description, icon }) => (
            <Link key={key} href={href} className="w-full group">
              <div className="flex flex-col items-start p-5 h-full rounded-xl border border-solid border-gray-200 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-3 w-full">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-50 text-gray-900 group-hover:bg-gray-900 group-hover:text-white transition-all duration-300">
                    {icon}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                    {t(key)}
                  </h3>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed font-medium pl-1">
                  {t(description)}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* 副标题 */}
        {/* <p className="mt-12 px-10 max-w-3xl text-lg md:text-xl text-gray-500 font-normal">
          {t("让热爱在此回响")}
        </p> */}
      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? "zh", ["common"])),
    },
  };
};
