import { ChordRecognition } from "@/components/ChordRecognition";
import Head from "next/head";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { GetStaticProps } from "next";

export default function ChordEditorPage() {
  const { t } = useTranslation("chord");

  return (
    <>
      <Head>
        <title>{t("和弦识别 - 上传歌曲文件识别和弦")}</title>
      </Head>
      <div className="flex flex-col gap-8">
        <ChordRecognition />
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? "zh", ["chord", "common"])),
    },
  };
};
