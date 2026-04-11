import { api } from "@/services/api";
import { LuvEditor } from "@/components/LuvEditor";
import { useEffect, useState } from "react";
import { useProxy } from "valtio/utils";
import { proxy } from "valtio";
import CollectionCard from "../CollectionCard";
import { parseLvText } from "@/services/utils";
import { Button, Divider } from "antd";
import { MODE } from "../LuvEditor/Editor/constants";

const _state = proxy({
  post: [],
  pkg: "" as any,
});

export const OneSong = () => {
  const state = useProxy(_state);
  const actions = {
    fetch: async () => {
      const { post, pkg } = await api.get("/one-song-data");
      state.post = JSON.parse(post);
      state.pkg = pkg;
    },
  };

  useEffect(() => {
    actions.fetch();
  }, []);

  const [collapse, setCollapse] = useState(false);

  const pkg = state.pkg;
  const { title } = parseLvText(state.post);

  return (
    <div
      className="fixed z-10 w-full transition-all duration-700"
      style={{
        top: collapse ? "var(--app-header-offset)" : "calc(100vh - 40px)",
      }}
    >
      <header
        style={{
          borderRadius: "40px 40px 0 0",
          boxShadow: "0 -5px 5px -5px rgba(0, 0, 0, 0.15)",
        }}
        onClick={() => setCollapse(!collapse)}
        className="cursor-pointer text-sm sticky top-0 z-10 bg-white font-thin pointer h-10 flex justify-center items-center"
      >
        【每日积累】{title}
      </header>
      <div
        className="p-4 bg-white"
        style={{
          height: "calc(100vh - var(--app-header-offset) - 36px)",
          overflow: "auto",
        }}
      >
        {state.post.length > 0 && (
          <LuvEditor mode={MODE.VIEW} initialValue={state.post} />
        )}
        <div className="mt-4">{pkg && <CollectionCard shareUuid={pkg} />}</div>

        <Divider />

        <Button className="w-full" onClick={() => setCollapse(!collapse)}>
          关闭
        </Button>
      </div>
    </div>
  );
};
