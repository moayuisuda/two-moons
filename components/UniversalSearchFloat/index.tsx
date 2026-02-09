import React, { useState } from "react";
import { Button } from "antd";
import { MoonFilled } from "@ant-design/icons";
import { useTranslation } from "next-i18next";
import UniversalSearch from "@/components/UniversalSearch";
import styles from "./index.module.scss";
import { useSnapshot } from "valtio";
import { appStore } from "@/stores/store";

export const UniversalSearchFloat: React.FC = () => {
  const { t } = useTranslation("common");
  const { isInit } = useSnapshot(appStore);

  const [searchVisible, setSearchVisible] = useState(false);

  return (
    <>
      <Button
        shape="circle"
        disabled={!isInit}
        icon={<MoonFilled style={{ fontSize: 16 }} />}
        onClick={() => setSearchVisible(true)}
        className={`${styles.searchFloat}`}
        title={t("全能助手 Mooner🌙")}
      />

      <UniversalSearch
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
      />
    </>
  );
};
