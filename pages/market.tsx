import React, { useState, useEffect, useRef } from "react";
import { Input, message, Spin, Empty, Pagination, Tabs } from "antd";
import { SearchOutlined, ShopOutlined } from "@ant-design/icons";
import { proxy, useSnapshot } from "valtio";
import { api } from "@/services/api";
import { appStore } from "@/stores/store";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { GetStaticProps } from "next";
import Head from "next/head";
import { MarketItemCard } from "@/components/MarketItemCard";

const { Search } = Input;

interface MarketItem {
  id: string;
  created_at: string;
  content: any;
  created_by?: string;
  type: "chord" | "phrase";
}

interface MarketListResponse {
  list: MarketItem[];
  total: number;
  page: number;
  pageSize: number;
}

export default function Marketplace() {
  const { t } = useTranslation("market");
  const [state] = useState(
    proxy({
      marketList: [] as MarketItem[],
      total: 0,
      loading: false,
      searchTerm: "",
      page: 1,
      pageSize: 10,
      activeType: "all" as "all" | "chord" | "phrase",
    })
  );

  const { marketList, total, loading, searchTerm, page, pageSize, activeType } =
    useSnapshot(state, { sync: true });

  const { isInit } = useSnapshot(appStore);

  // Race condition control and debounce
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load Market List
  const loadMarketList = async (
    searchQuery?: string,
    pageNum?: number,
    type?: string
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    state.loading = true;
    try {
      const params: any = {
        page: pageNum || state.page,
        pageSize: state.pageSize,
        search: searchQuery !== undefined ? searchQuery : state.searchTerm,
      };

      const currentType = type !== undefined ? type : state.activeType;
      if (currentType && currentType !== "all") {
        params.type = currentType;
      }

      const response: MarketListResponse = await api.get("/market", {
        params,
        signal,
      });

      if (signal.aborted) return;

      state.marketList = response.list || [];
      state.total = response.total || 0;
    } catch (error: any) {
      if (error.name === "AbortError" || signal.aborted) {
        return;
      }
      console.error(t("加载分享列表失败:"), error);
      message.error(t("加载分享列表失败"));
    } finally {
      if (!signal.aborted) {
        state.loading = false;
      }
    }
  };

  useEffect(() => {
    if (isInit) {
      loadMarketList();
    }
  }, [isInit]);

  useEffect(() => {
    // Refresh when tab changes
    state.page = 1;
    loadMarketList(state.searchTerm, 1, state.activeType);
  }, [activeType]);

  const handleSearch = (value: string) => {
    state.searchTerm = value;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      state.page = 1;
      loadMarketList(value, 1);
    }, 500);
  };

  const handlePageChange = (pageNum: number, pageSize?: number) => {
    state.page = pageNum;
    if (pageSize && pageSize !== state.pageSize) {
      state.pageSize = pageSize;
    }
    loadMarketList(state.searchTerm, pageNum);
  };

  return (
    <>
      <Head>
        <title>{t("和弦/乐句市场 - 分享合集")}</title>
        <meta name="description" content={t("发现和导入精选的合集")} />
      </Head>

      <div className="min-h-screen">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* 页面标题 */}
          <div className="text-center mb-4">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              <ShopOutlined /> {t("市场")}
            </h1>
            <p className="text-gray-600">{t("发现和导入精选的合集")}</p>
            <div className="flex justify-center mt-2">
              <ul
                className="text-gray-500 text-sm text-left"
                style={{ width: 340 }}
              >
                <li>✔ {t("上传可复用的片段，而非大段的完整进行")}</li>
                <li>✔ {t("请给你的片段命名有意义的名称")}</li>
              </ul>
            </div>
          </div>

          <div className="mb-8">
            <Search
              placeholder={t("搜索合集名称...")}
              allowClear
              enterButton={<SearchOutlined />}
              size="large"
              onChange={(e) => handleSearch(e.target.value)}
              onSearch={(value) => handleSearch(value)}
              className="max-w-2xl mx-auto block"
            />
          </div>

          <Spin spinning={loading} tip={t("加载中...")}>
            {marketList.length > 0 ? (
              <>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2 mb-6">
                  {marketList.map((item) => (
                    <MarketItemCard key={item.id} item={item} />
                  ))}
                </div>
                <div className="flex justify-center">
                  <Pagination
                    current={page}
                    pageSize={pageSize}
                    total={total}
                    showSizeChanger
                    showQuickJumper
                    showTotal={(total) => t("共 {{total}} 条记录", { total })}
                    onChange={handlePageChange}
                    onShowSizeChange={handlePageChange}
                  />
                </div>
              </>
            ) : (
              <Empty
                description={
                  searchTerm
                    ? t("没有找到合集").replace("{searchTerm}", searchTerm)
                    : t("暂无可用的分享合集")
                }
                className="mt-16"
              />
            )}
          </Spin>
        </div>
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? "zh", ["market", "common"])),
    },
  };
};
