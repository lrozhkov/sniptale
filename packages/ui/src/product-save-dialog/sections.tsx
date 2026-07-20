import { Check, FolderInput, FolderOpen, X } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { ProductField, ProductInput } from '../product-form-controls';
import type { ProductSaveDialogPresetItem } from './types';

export function ProductSaveDialogHeader({
  title,
  subtitle,
  closeLabel,
  onClose,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="sniptale-modal-header">
      <div className="sniptale-save-dialog-heading">
        <div className="sniptale-save-dialog-icon-badge sniptale-save-dialog-icon">
          <FolderOpen size={18} />
        </div>
        <div>
          <h2 id="save-dialog-title" className="sniptale-modal-title">
            {title}
          </h2>
          <p className="sniptale-save-dialog-subtitle">{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="sniptale-modal-close"
        aria-label={closeLabel}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function ProductSaveDialogFilenameSection({
  filenameLabel,
  filename,
  filenamePlaceholder,
  onFilenameChange,
}: {
  filenameLabel: ReactNode;
  filename: string;
  filenamePlaceholder?: string;
  onFilenameChange: (value: string) => void;
}) {
  return (
    <section className="sniptale-save-dialog-section">
      <ProductField label={filenameLabel}>
        <ProductInput
          id="save-dialog-filename"
          type="text"
          value={filename}
          onChange={(event) => onFilenameChange(event.target.value)}
          className="sniptale-save-dialog-input"
          placeholder={filenamePlaceholder}
        />
      </ProductField>
    </section>
  );
}

export function ProductSaveDialogPresetSection({
  presetLabel,
  presetCount,
  presetItems,
  presetsEmptyState,
  onChoosePreset,
}: {
  presetLabel: ReactNode;
  presetCount: ReactNode;
  presetItems: ProductSaveDialogPresetItem[];
  presetsEmptyState?: ReactNode;
  onChoosePreset: (presetId: string, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <section className="sniptale-save-dialog-section">
      <div className="sniptale-save-dialog-section-head">
        <span className="sniptale-save-dialog-section-label">{presetLabel}</span>
        <span className="sniptale-save-dialog-badge">{presetCount}</span>
      </div>

      {presetItems.length === 0 ? (
        <div className="sniptale-save-dialog-empty">{presetsEmptyState}</div>
      ) : (
        <div className="sniptale-save-dialog-list">
          {presetItems.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={(event) => onChoosePreset(preset.id, event)}
              className="sniptale-save-dialog-item"
            >
              <span className="sniptale-save-dialog-item-icon">
                <FolderOpen size={18} />
              </span>
              <span className="sniptale-save-dialog-item-copy">
                <span className="sniptale-save-dialog-item-title">{preset.title}</span>
                <span className="sniptale-save-dialog-item-path">{preset.path}</span>
              </span>
              <Check size={16} className="sniptale-save-dialog-item-check" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProductSaveDialogSystemFolderButton({
  systemFolderLabel,
  systemFolderHint,
  onChooseSystemFolder,
}: {
  systemFolderLabel: ReactNode;
  systemFolderHint: ReactNode;
  onChooseSystemFolder: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button type="button" onClick={onChooseSystemFolder} className="sniptale-save-dialog-system">
      <FolderInput size={18} className="sniptale-save-dialog-system-icon" />
      <span className="sniptale-save-dialog-system-copy">
        <span className="sniptale-save-dialog-system-label">{systemFolderLabel}</span>
        <span className="sniptale-save-dialog-system-hint">{systemFolderHint}</span>
      </span>
    </button>
  );
}
