import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  SettingOutlined,
  EditOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  HolderOutlined,
  FileTextOutlined,
  FolderOutlined,
  CheckOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import Head from "next/head";
import { useEffect, useState, useMemo, useRef } from "react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "./index.module.scss";
import classNames from "classnames";
import { isMobile } from "@/utils/env";
import { phraseStore, phraseActions } from "@/stores/phraseStore";
import { useSnapshot } from "valtio";
import {
  Button,
  Card,
  Select,
  InputNumber,
  Input,
  message,
  Switch,
  Modal,
  Spin,
} from "antd";
import CustomTextInput from "@/components/CustomTextInput";
import StaffNotation from "@/components/StaffNotation";
import { PhraseBlock } from "@/components/PhraseBlock";
import { appStore } from "@/stores/store";
import {
  useMobileFriendlySensors,
  dragHandleStyles,
  dragHandleClassName,
} from "@/utils/dndkit";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { GetStaticProps } from "next";

// 可排序的乐句块组件
const SortableItem = ({ block, index }: { block: any; index: number }) => {
  const { t } = useTranslation("phrase");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // 为拖拽手柄添加属性
  const dragHandleProps = {
    ...attributes,
    ...listeners,
    className: `text-gray-500 text-lg ${dragHandleClassName}`,
    style: dragHandleStyles,
  };

  return (
    <PhraseBlock
      setNodeRef={setNodeRef}
      isDragging={isDragging}
      onCollect={() => {
        phraseActions.selectBlock(index);
        phraseActions.toggleCollectionModal();
      }}
      block={block}
      style={style}
      onDelete={(id: string) => {
        if (confirm(t("确定要删除吗？"))) {
          phraseActions.deleteBlock(id);
          message.success(t("乐句已删除"));
        }
      }}
      onUpdate={(id: string, key: string, value: any) =>
        phraseActions.updateBlock(id, key, value)
      }
      dragHandleProps={dragHandleProps}
    />
  );
};

const PhraseNotebook = () => {
  const { t } = useTranslation("phrase");
  const {
    blocks,
    isPlaying,
    collections,
    currentCollectionId,
    showCollectionModal,
    selectedBlockIndex,
    searchTerm,
  } = useSnapshot(phraseStore, { sync: true });
  const [globalStaffNotation, setGlobalStaffNotation] = useState(true);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(
    null
  );
  const [editingCollectionName, setEditingCollectionName] = useState("");

  const { isInit } = useSnapshot(appStore);

  // 初始化数据
  useEffect(() => {
    // console.log("phrase init", isInit);
    if (!isInit) return;
    phraseActions.init().catch((error) => {
      console.error("Failed to initialize phrase data:", error);
    });

    // 为什么不 await init()
    // token 可能会更新，跟新之后，也要重新 merge
  }, [isInit]);

  // 同步全局五线谱开关状态
  useEffect(() => {
    if (blocks.length > 0) {
      // 检查是否所有乐句块都开启了五线谱显示
      const allEnabled = blocks.every((block) => block.showStaffNotation);
      setGlobalStaffNotation(allEnabled);
    }
  }, [blocks]);

  // 过滤乐句块
  const filteredBlocks = useMemo(() => {
    let result = blocks;

    // 根据当前选择的合集过滤
    if (currentCollectionId) {
      const currentCollection = collections.find(
        (c) => c.id === currentCollectionId
      );
      if (currentCollection) {
        result = blocks.filter((block) =>
          currentCollection.ids.includes(block.id)
        );
      }
    }

    // 根据搜索词过滤
    if (searchTerm.trim()) {
      result = result.filter(
        (block) =>
          block.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          block.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return result;
  }, [blocks, searchTerm, currentCollectionId, collections]);

  // 拖拽结束处理函数
  const handleDragEnd = (result: DragEndEvent) => {
    const { active, over } = result;

    if (active.id === over?.id) {
      return;
    }

    const oldIndex = blocks.findIndex((block) => block.id === active.id);
    const newIndex = blocks.findIndex((block) => block.id === over?.id);

    if (oldIndex !== newIndex) {
      phraseActions.reorderBlocks(oldIndex, newIndex);
    }
  };

  // 使用移动端友好的拖拽传感器
  const sensors = useMobileFriendlySensors();

  return (
    <div className={classNames(styles.container)}>
      <Head>
        <title>{t("乐句笔记本")}</title>
        <meta
          name="description"
          content={t("记录和播放音乐乐句的笔记本工具")}
        />
        <meta name="keywords" content={t("乐句,笔记本,音乐,播放,简谱")} />
      </Head>

      <div className="max-w-4xl mx-auto p-4 md:p-8">
        {/* 顶部控制栏 */}
        <div
          className="sticky z-20 mb-4"
          style={{ top: "var(--app-header-offset)" }}
        >
          <div className="flex items-center justify-between gap-4 mb-4">
            {/* 搜索框 */}
            <div className="flex-1 max-w-md mx-auto">
              <Input
                placeholder={t("搜索乐句名称或内容...")}
                prefix={<SearchOutlined />}
                value={searchTerm}
                onChange={(e) => phraseActions.setSearchTerm(e.target.value)}
                allowClear
                size="large"
                className="shadow-lg bg-white"
              />
            </div>

            {/* 合集选择器和五线谱开关 */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Select
                virtual={false}
                className="rounded-lg shadow-lg"
                placeholder={t("选择合集")}
                prefix={<FolderOutlined className="mr-1"></FolderOutlined>}
                value={currentCollectionId}
                onChange={(value) => phraseActions.setCurrentCollection(value)}
                style={{ minWidth: 120, height: 36 }}
                popupMatchSelectWidth={false}
                dropdownRender={(menu) => (
                  <div>
                    {menu}
                    <Button
                      icon={<EditOutlined />}
                      type="text"
                      onClick={() => phraseActions.toggleCollectionModal()}
                      className="w-full text-left"
                    >
                      {t("编辑合集")}
                    </Button>
                  </div>
                )}
              >
                <Select.Option key="all" value={null}>
                  <div className="flex items-center justify-between">
                    <span>{t("全部")}</span>
                    <span className="text-gray-400 text-xs ml-2">
                      ({blocks.length})
                    </span>
                  </div>
                </Select.Option>
                {collections.map((collection) => {
                  return (
                    <Select.Option key={collection.id} value={collection.id}>
                      <div className="flex items-center justify-between">
                        <span>{collection.name}</span>
                        <span className="text-gray-400 text-xs ml-2">
                          ({collection.ids.length})
                        </span>
                      </div>
                    </Select.Option>
                  );
                })}
              </Select>

              {/* 全局五线谱开关 */}
              <div
                className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg shadow-lg"
                style={{
                  border: "1px solid #d9d9d9",
                  height: 36,
                }}
              >
                <FileTextOutlined className="text-gray-600" />
                <span className="text-sm text-gray-700 whitespace-nowrap">
                  {t("五线谱")}
                </span>
                <Switch
                  checked={globalStaffNotation}
                  onChange={(checked) => {
                    setGlobalStaffNotation(checked);
                    // 更新所有乐句块的五线谱显示状态
                    blocks.forEach((block) => {
                      phraseActions.updateBlock(
                        block.id,
                        "showStaffNotation",
                        checked
                      );
                    });
                  }}
                  size="small"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-xs mb-2 text-gray-600">
          {t("「b1」唱名, 「,」低八度, 「'」高八度, 「-」空拍，「t」连音")}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={blocks.map((block) => block.id)}
            strategy={verticalListSortingStrategy}
          >
            {filteredBlocks.map((block, index) => (
              <SortableItem key={block.id} block={block} index={index} />
            ))}
          </SortableContext>
        </DndContext>

        {/* 空状态显示 */}
        {blocks.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-4">
              {t("还没有乐句记录")}
            </div>
          </div>
        )}

        {/* 搜索无结果 */}
        {blocks.length > 0 && filteredBlocks.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-4">
              {t("没有找到乐句").replace("{searchTerm}", searchTerm)}
            </div>
            <Button
              type="default"
              onClick={() => phraseActions.setSearchTerm("")}
            >
              {t("清除搜索")}
            </Button>
          </div>
        )}

        {/* 添加新乐句块和随机乐句按钮 */}
        <div className="flex gap-4 mt-8">
          <Card
            className={classNames(styles.addCard, "cursor-pointer flex-1")}
            hoverable
            style={{
              border: "2px dashed #d1d5db",
            }}
            bodyStyle={{ padding: "12px" }}
            onClick={() => {
              phraseActions.addBlock();
              window.scrollTo(0, document.body.clientHeight);
            }}
          >
            <div className="text-center text-gray-500">
              <PlusOutlined className="text-2xl mb-2" />
              <div>{t("添加新的乐句块")}</div>
            </div>
          </Card>

          <Card
            className={classNames(styles.addCard, "cursor-pointer flex-1")}
            hoverable
            style={{
              border: "2px dashed #d1d5db",
            }}
            bodyStyle={{ padding: "12px" }}
            onClick={() => {
              phraseActions.addRandomBlock();
              window.scrollTo(0, document.body.clientHeight);
            }}
          >
            <div className="text-center text-gray-500">
              <ThunderboltOutlined className="text-2xl mb-2" />
              <div>{t("添加随机乐句块")}</div>
            </div>
          </Card>
        </div>

        {/* 合集选择模态框 */}
        <Modal
          title={
            selectedBlockIndex !== null
              ? t("将「{{name}}」添加到合集", {
                  name: filteredBlocks[selectedBlockIndex]?.name,
                })
              : t("管理乐句合集")
          }
          open={showCollectionModal}
          onCancel={() => phraseActions.toggleCollectionModal()}
          footer={null}
          width={500}
        >
          <div className="space-y-4">
            {/* 创建新合集 */}
            <div className="border rounded-lg p-4">
              <h4 className="text-sm font-medium mb-2">{t("创建新合集")}</h4>
              <div className="flex gap-2">
                <Input
                  placeholder={t("输入合集名称")}
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  onPressEnter={() => {
                    if (newCollectionName.trim()) {
                      phraseActions.createCollection(newCollectionName.trim());

                      setNewCollectionName("");
                      phraseActions.toggleCollectionModal();
                      message.success(t("合集创建成功"));
                    }
                  }}
                />
                <Button
                  type="primary"
                  onClick={() => {
                    if (newCollectionName.trim()) {
                      phraseActions.createCollection(newCollectionName.trim());

                      setNewCollectionName("");
                      phraseActions.toggleCollectionModal();
                      message.success(t("合集创建成功"));
                    }
                  }}
                  disabled={!newCollectionName.trim()}
                >
                  {t("创建")}
                </Button>
              </div>
            </div>

            {/* 现有合集列表 */}
            {collections.length > 0 && (
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-medium mb-2">
                  {t("添加到现有合集")}
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {collections.map((collection) => (
                    <div
                      key={collection.id}
                      className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        if (selectedBlockIndex !== null) {
                          const selectedBlock =
                            filteredBlocks[selectedBlockIndex];
                          if (collection.ids.includes(selectedBlock.id)) {
                            phraseActions.removeFromCollection(
                              selectedBlock.id,
                              collection.id
                            );
                            phraseStore.selectedBlockIndex = null;
                            message.success(
                              t("已从「{{name}}」中移除", {
                                name: collection.name,
                              })
                            );
                          } else {
                            phraseActions.addToCollection(
                              selectedBlock.id,
                              collection.id
                            );
                            message.success(
                              t("已添加到「{{name}}」", {
                                name: collection.name,
                              })
                            );
                          }
                          phraseActions.toggleCollectionModal();
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <FolderOutlined />
                        {editingCollectionId === collection.id ? (
                          <Input
                            value={editingCollectionName}
                            onChange={(e) =>
                              setEditingCollectionName(e.target.value)
                            }
                            onPressEnter={() => {
                              const newName = editingCollectionName.trim();
                              if (newName && newName !== collection.name) {
                                phraseActions.updateCollectionName(
                                  collection.id,
                                  newName
                                );
                                message.success(t("合集名称已更新"));
                              }
                              setEditingCollectionId(null);
                              setEditingCollectionName("");
                            }}
                            onBlur={() => {
                              const newName = editingCollectionName.trim();
                              if (newName && newName !== collection.name) {
                                phraseActions.updateCollectionName(
                                  collection.id,
                                  newName
                                );
                                message.success(t("合集名称已更新"));
                              }
                              setEditingCollectionId(null);
                              setEditingCollectionName("");
                            }}
                            autoFocus
                            size="small"
                            className="flex-1"
                          />
                        ) : (
                          <span>{collection.name}</span>
                        )}
                        <span className="text-gray-400 text-xs">
                          ({collection.ids.length})
                        </span>
                        {selectedBlockIndex !== null &&
                          filteredBlocks[selectedBlockIndex] &&
                          collection.ids.includes(
                            filteredBlocks[selectedBlockIndex].id
                          ) && <CheckOutlined className="text-green-500" />}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="small"
                          type="text"
                          icon={<EditOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCollectionId(collection.id);
                            setEditingCollectionName(collection.name);
                          }}
                        />
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              confirm(
                                t("确定要删除合集「{{name}}」吗？", {
                                  name: collection.name,
                                })
                              )
                            ) {
                              phraseActions.deleteCollection(collection.id);
                              message.success(t("合集已删除"));
                            }
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {collections.length === 0 && (
              <div className="text-center text-gray-400 py-4">
                {t("还没有创建任何合集")}
              </div>
            )}
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default PhraseNotebook;

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? "zh", ["phrase", "common"])),
    },
  };
};
