/** @type {import('next').NextConfig} */
const { i18n } = require("./next-i18next.config");
const withTM = require("next-transpile-modules")(["react-markdown"]); // or whatever library giving trouble
const withPWA = require("next-pwa")({
  dest: "public",
  disable:
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_BUILD_MODE === "EXPORT",
  register: true,
  skipWaiting: true,
});
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const EXPORT_CONFIG =
  process.env.NEXT_PUBLIC_BUILD_MODE === "EXPORT"
    ? {
        output: "export", // 关键：退化为静态站点
        distDir: "out", // 输出目录（Capacitor 默认读 out）
        trailingSlash: true,
      }
    : {};

const HEADER_CONFIG = {
  // enable cross-origin isolation for SharedArrayBuffer and multi-threading onnx inference
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "Cross-Origin-Opener-Policy",
          value: "same-origin",
        },
        {
          key: "Cross-Origin-Embedder-Policy",
          value: "require-corp",
        },
      ],
    },
  ],
};

module.exports = withBundleAnalyzer(
  withTM(
    withPWA({
      ...EXPORT_CONFIG,
      ...HEADER_CONFIG,
      reactStrictMode: false,
      swcMinify: true,
      transpilePackages: [
        "rc-util",
        "rc-picker",
        "rc-pagination",
        // "rc-tree",
        // "rc-table",
        "@ant-design/icons-svg",
      ],
      i18n: process.env.DISBALE_I18 === "true" ? undefined : i18n,
      webpack(config) {
        const fileLoaderRule = config.module.rules.find((rule) =>
          rule.test?.test?.(".svg")
        );

        config.module.rules.push(
          {
            ...fileLoaderRule,
            test: /\.svg$/i,
            resourceQuery: /url/,
          },
          {
            test: /\.svg$/i,
            issuer: fileLoaderRule.issuer,
            resourceQuery: {
              not: [...fileLoaderRule.resourceQuery.not, /url/],
            },
            use: ["@svgr/webpack"],
          }
        );

        fileLoaderRule.exclude = /\.svg$/i;

        return config;
      },
    })
  )
);
