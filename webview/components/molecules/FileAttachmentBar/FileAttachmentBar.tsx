import { useLocale } from "../../../locales";
import { getFileIcon } from "../../../utils/file-icons";
import type { FileAttachment } from "../../../vscode-api";
import { IconButton } from "../../atoms/IconButton";
import { ClipIcon, CloseIcon, PlusIcon } from "../../atoms/icons";
import { ListItem } from "../../atoms/ListItem";
import styles from "./FileAttachmentBar.module.css";

type Props = {
  attachedFiles: FileAttachment[];
  activeEditorFile: FileAttachment | null;
  isActiveAttached: boolean;
  showFilePicker: boolean;
  filePickerQuery: string;
  pickerFiles: FileAttachment[];
  onClipClick: () => void;
  onFilePickerSearch: (query: string) => void;
  onAddFile: (file: FileAttachment) => void;
  onRemoveFile: (filePath: string) => void;
  filePickerRef: React.RefObject<HTMLDivElement | null>;
};

export function FileAttachmentBar({
  attachedFiles,
  activeEditorFile,
  isActiveAttached,
  showFilePicker,
  filePickerQuery,
  pickerFiles,
  onClipClick,
  onFilePickerSearch,
  onAddFile,
  onRemoveFile,
  filePickerRef,
}: Props) {
  const t = useLocale();

  return (
    <div className={styles.left}>
      {/* クリップボタン */}
      <div className={styles.clipContainer} ref={filePickerRef}>
        <IconButton
          variant="outlined"
          size="sm"
          active={showFilePicker}
          onClick={onClipClick}
          title={t["input.addContext"]}
        >
          <ClipIcon />
        </IconButton>
        {showFilePicker && (
          <div className={styles.pickerDropdown}>
            <input
              className={styles.pickerSearch}
              placeholder={t["input.searchFiles"]}
              value={filePickerQuery}
              onChange={(e) => onFilePickerSearch(e.target.value)}
            />
            <div className={styles.pickerList}>
              {pickerFiles.length > 0 ? (
                pickerFiles.slice(0, 15).map((file) => {
                  const FileIcon = getFileIcon(file.fileName);
                  return (
                    <ListItem
                      key={file.filePath}
                      title={file.fileName}
                      description={file.filePath}
                      icon={<FileIcon width={14} height={14} />}
                      onClick={() => onAddFile(file)}
                    />
                  );
                })
              ) : (
                <div className={styles.pickerEmpty}>{t["input.noFiles"]}</div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* 添付されたファイルチップ (インライン) */}
      {attachedFiles.map((file) => {
        const ChipIcon = getFileIcon(file.fileName);
        return (
          <div key={file.filePath} className={styles.chip}>
            <span className={styles.chipIcon}>
              <ChipIcon width={14} height={14} />
            </span>
            <span className={styles.chipName}>{file.fileName}</span>
            <button
              type="button"
              className={styles.chipRemove}
              onClick={() => onRemoveFile(file.filePath)}
              title={t["input.remove"]}
            >
              <CloseIcon width={12} height={12} />
            </button>
          </div>
        );
      })}
      {/* 現在開いているファイルの quick-add ボタン */}
      {activeEditorFile &&
        !isActiveAttached &&
        (() => {
          const QuickAddIcon = getFileIcon(activeEditorFile.fileName);
          return (
            <button
              type="button"
              className={styles.fileButton}
              onClick={() => onAddFile(activeEditorFile)}
              title={t["input.addFile"](activeEditorFile.filePath)}
            >
              <PlusIcon />
              <QuickAddIcon width={12} height={12} />
              <span>{activeEditorFile.fileName}</span>
            </button>
          );
        })()}
    </div>
  );
}
