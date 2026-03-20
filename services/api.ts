import axios from "axios";
import { apiState } from "./state";
import { message } from "antd";

const api = axios.create({
  baseURL: (process.env.NEXT_PUBLIC_SERVER_BASE ?? "") + "/api",
});
const aiApi = axios.create({
  baseURL: "https://open.bigmodel.cn/api/paas",
});

// message deduplication
const messageDeduplication = new Map<string, number>();
const DEDUP_WINDOW = 3000;

function showDedupMessage(
  content: string,
  type: "error" | "warning" | "info" = "error"
) {
  const now = Date.now();
  const key = `${type}:${content}`;

  const lastShown = messageDeduplication.get(key);
  if (lastShown && now - lastShown < DEDUP_WINDOW) {
    return;
  }

  messageDeduplication.set(key, now);
  message[type](content);

  setTimeout(() => {
    messageDeduplication.delete(key);
  }, DEDUP_WINDOW);
}

export const authErrorMiddleware = (err) => {
  if (err.response?.status === 401) {
    return false;
  }
  return true;
};

api.interceptors.request.use(
  (config) => {
    const { moonToken, authToken } = apiState;
    Object.assign(config.headers, {
      "authorization-ai": moonToken,
      "authorization-auth": authToken,
    });

    return config;
  },
  (error) => {
    console.log(error);
    Promise.reject(error);
  }
);

aiApi.interceptors.response.use(
  (res) => {
    return res.data;
  },
  (err) => {
    return Promise.reject(err);
  }
);

api.interceptors.response.use(
  (res) => {
    return res.data;
  },
  (err) => {
    if (!authErrorMiddleware(err)) {
      showDedupMessage("当前用户无权限，请刷新页面或重新登录");
      localStorage.removeItem("auth");
    }
    return Promise.reject(err);
  }
);

export { api, aiApi };
