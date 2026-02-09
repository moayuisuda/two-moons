import { useRouter } from "next/router";
import Link from "next/link";
import { Menu, Space } from "antd";
import { useContext } from "react";
import { useSnapshot } from "valtio";
import { StateContext } from "@/pages/_app";
import { appStore } from "@/stores/store";
import { CloudSyncOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { useTranslation } from "next-i18next";

const MenuLink = ({ href, children }) => {
  return (
    <Link legacyBehavior href={href}>
      <a className="block text-primary">{children}</a>
    </Link>
  );
};

const AUTH_PATHS = ["/post/edit", "/post/list"];
export const Header: React.FC = () => {
  const router = useRouter();
  const state = useContext(StateContext);
  const { user } = useSnapshot(state);
  const { isInit, syncing } = useSnapshot(appStore);
  const isLoggedIn = !!user?.name;
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language;

  // 获取状态点的样式
  const getStatusDotStyle = () => {
    if (!isInit || syncing) {
      return "w-2 h-2 bg-yellow-500 rounded-full transition duration-300";
    }

    return "w-2 h-2 bg-green-500 rounded-full transition-all duration-300";
  };

  // 获取状态提示文本
  const getStatusTitle = () => {
    if (!isInit) {
      return t("初始化中");
    }
    if (syncing) {
      return t("正在同步");
    }
    return t("已登录");
  };

  // 全量路由配置 - 所有用户都可访问
  const menuItemsMap = {
    zh: [
      {
        key: "tutorial",
        label: t("教程"),
        children: [
          {
            key: "a-song",
            label: <MenuLink href="/post/basic/a-song">序章</MenuLink>,
          },
          {
            key: "scale",
            label: <MenuLink href="/post/basic/scale">音阶</MenuLink>,
          },
          {
            key: "rhythm",
            label: <MenuLink href="/post/basic/rhythm">旋律</MenuLink>,
          },
          {
            key: "harmony-I",
            label: <MenuLink href="/post/basic/harmony-I">和弦-I</MenuLink>,
          },
          {
            key: "harmony-II",
            label: <MenuLink href="/post/basic/harmony-II">和弦-II</MenuLink>,
          },
          {
            key: "modulation",
            label: <MenuLink href="/post/basic/modulation">离调-I</MenuLink>,
          },
        ],
      },
      {
        key: "practice",
        label: t("练习"),
        children: [
          {
            key: "sight-singing",
            label: <MenuLink href="/practice">{t("视唱")}</MenuLink>,
          },
          {
            key: "fretboard",
            label: <MenuLink href="/guitar-practice">{t("指板")}</MenuLink>,
          },
          {
            key: "plan",
            label: <MenuLink href="/plan">{t("计划")}</MenuLink>,
          },
        ],
      },
      {
        key: "chord",
        label: <MenuLink href="/chord">{t("和弦")}</MenuLink>,
      },
      {
        key: "market",
        label: <MenuLink href="/market">{t("市场")}</MenuLink>,
      },
      {
        key: "lab",
        label: t("实验室"),
        children: [
          {
            key: "editor",
            label: <MenuLink href="/post/edit">{t("编辑器")}</MenuLink>,
          },
        ],
      },
      {
        key: "setting",
        label: <MenuLink href="/setting">{t("设置")}</MenuLink>,
      },
    ],
    en: [
      {
        key: "tutorial",
        label: t("教程"),
        children: [
          {
            key: "a-song",
            label: <MenuLink href="/post/basic/a-song">Prologue</MenuLink>,
          },
          {
            key: "scale",
            label: <MenuLink href="/post/basic/scale">Scale</MenuLink>,
          },
          {
            key: "rhythm",
            label: <MenuLink href="/post/basic/rhythm">Melody</MenuLink>,
          },
          {
            key: "harmony-I",
            label: <MenuLink href="/post/basic/harmony-I">Harmony-I</MenuLink>,
          },
          {
            key: "harmony-II",
            label: (
              <MenuLink href="/post/basic/harmony-II">Harmony-II</MenuLink>
            ),
          },
          {
            key: "modulation",
            label: (
              <MenuLink href="/post/basic/modulation">Modulation-I</MenuLink>
            ),
          },
        ],
      },
      {
        key: "practice",
        label: t("练习"),
        children: [
          {
            key: "sight-singing",
            label: <MenuLink href="/practice">{t("视唱")}</MenuLink>,
          },
          {
            key: "fretboard",
            label: <MenuLink href="/guitar-practice">{t("指板")}</MenuLink>,
          },
          {
            key: "plan",
            label: <MenuLink href="/plan">{t("计划")}</MenuLink>,
          },
        ],
      },
      {
        key: "chord",
        label: <MenuLink href="/chord">{t("和弦")}</MenuLink>,
      },
      {
        key: "market",
        label: <MenuLink href="/market">{t("市场")}</MenuLink>,
      },
      {
        key: "lab",
        label: t("实验室"),
        children: [
          {
            key: "editor",
            label: <MenuLink href="/post/edit">{t("编辑器")}</MenuLink>,
          },
          // {
          //   key: "phrase",
          //   label: <MenuLink href="/phrase">{t("乐句")}</MenuLink>,
          // },
        ],
      },
      {
        key: "setting",
        label: <MenuLink href="/setting">{t("设置")}</MenuLink>,
      },
    ],
  };

  return (
    <header
      className="w-full border-0 border-b border-solid border-b-stone-100 h-12 flex items-center justify-between text-sm px-4 fixed top-0 z-30"
      style={{
        background: "rgba(255,255,255,.5)",
        backdropFilter: "blur(8px)",
        paddingTop: "var(--safe-area-inset-top)",
      }}
    >
      <a
        href="https://github.com/moayuisuda"
        target="_blank"
        rel="noopener noreferrer"
        className="font-thin font-mono text-inherit hidden md:block"
      >
        BY MOAYUISUDA
      </a>

      <Link legacyBehavior href="/">
        <img
          className="block cursor-pointer static md:absolute"
          src="/pics/logo.svg"
          alt=""
          style={{
            left: "calc(50% - 70px)",
          }}
          height={36}
        />
      </Link>

      <Space>
        <Menu
          overflowedIndicator={<UnorderedListOutlined />}
          className="flex items-center w-28 lg:w-auto justify-end"
          style={{
            lineHeight: "36px",
            minWidth: 0,
            flex: "auto",
          }}
          mode="horizontal"
          items={menuItemsMap[locale]}
        />
        {isLoggedIn && (
          <div className="flex items-center mr-2">
            <div
              style={{
                marginRight: -2,
                marginTop: -8,
              }}
              className={getStatusDotStyle()}
              title={getStatusTitle()}
            ></div>
            <CloudSyncOutlined style={{ fontSize: 16, marginTop: 2 }} />

            {/* <span className="text-xs text-gray-600">{user.name}</span> */}
          </div>
        )}
      </Space>
    </header>
  );
};
