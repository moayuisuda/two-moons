import { Button, Progress, Upload } from "antd";
import UploadOutlined from "@ant-design/icons/UploadOutlined";
import { useTranslation } from "react-i18next";

interface UploadProcessingProps {
  isConnected: boolean;
  isProcessing: boolean;
  progressText: string;
  progressPercent: number;
  errorMessage: string;
  onSelectFile: (file: File) => void;
}

export function UploadProcessing({
  isConnected,
  isProcessing,
  progressText,
  progressPercent,
  errorMessage,
  onSelectFile,
}: UploadProcessingProps) {
  const { t } = useTranslation("common");
  return (
    <>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Upload
          accept="audio/*"
          showUploadList={false}
          disabled={!isConnected || isProcessing}
          beforeUpload={(file) => {
            onSelectFile(file as File);
            return false;
          }}
        >
          <Button
            type="default"
            icon={<UploadOutlined />}
            loading={isProcessing}
            disabled={!isConnected || isProcessing}
            className="border-gray-400 text-gray-800"
          >
            {t("上传音频文件")}
          </Button>
        </Upload>
      </div>

      {(isProcessing || progressText) && (
        <div className="flex flex-col gap-2 w-full">
          {progressText && (
            <div className="text-xs text-gray-500 text-center">
              {progressText}
            </div>
          )}
          <Progress
            percent={progressPercent}
            status={
              errorMessage ? "exception" : isProcessing ? "active" : "normal"
            }
            strokeColor="#6b7280"
            trailColor="#f3f4f6"
            showInfo={false}
          />
        </div>
      )}

      {errorMessage && (
        <div className="text-red-600 text-xs text-center">{errorMessage}</div>
      )}
    </>
  );
}
