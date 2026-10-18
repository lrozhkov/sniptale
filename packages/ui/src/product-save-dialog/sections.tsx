import { Check, FolderInput, FolderOpen, X } from 'lucide-react';
import {
  useContext,
  useRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { CommandPressScope, useCommandPress } from '../control-language/press';
import { ProductInput } from '../product-form-controls';
import type { ProductSaveDialogPresetItem } from './types';

function SaveDialogCommand({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const adopted = useContext(CommandPressScope);
  const press = useCommandPress({ ...props, enabled: adopted });
  return (
    <button
      {...props}
      {...press.props}
      type="button"
      data-command-press={adopted ? '' : undefined}
      data-pressing={press.pressed ? 'true' : undefined}
    >
      {adopted ? <span className="sniptale-command-content">{children}</span> : children}
    </button>
  );
}

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
      <SaveDialogCommand
        type="button"
        onClick={onClose}
        className="sniptale-modal-close"
        aria-label={closeLabel}
      >
        <X size={16} />
      </SaveDialogCommand>
    </div>
  );
}

export function ProductSaveDialogFilenameSection({
  filenameLabel,
  filename,
  disabled,
  filenamePlaceholder,
  filenameClearLabel,
  onFilenameChange,
}: {
  filenameLabel: ReactNode;
  filename: string;
  disabled?: boolean;
  filenamePlaceholder?: string;
  filenameClearLabel?: string;
  onFilenameChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <section className="sniptale-save-dialog-section">
      <div className="sniptale-save-dialog-filename-group">
        <label className="sniptale-label-sm" htmlFor="save-dialog-filename">
          {filenameLabel}
        </label>
        <div className="sniptale-save-dialog-field">
          <ProductInput
            ref={inputRef}
            id="save-dialog-filename"
            type="text"
            disabled={disabled}
            value={filename}
            onChange={(event) => onFilenameChange(event.target.value)}
            className="sniptale-save-dialog-input"
            placeholder={filenamePlaceholder}
          />
          {filenameClearLabel && filename && !disabled ? (
            <SaveDialogCommand
              className="sniptale-save-dialog-clear"
              aria-label={filenameClearLabel}
              title={filenameClearLabel}
              onClick={() => {
                onFilenameChange('');
                inputRef.current?.focus();
              }}
            >
              <X size={16} />
            </SaveDialogCommand>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ProductSaveDialogPresetSection({
  presetLabel,
  presetCount,
  disabled,
  presetItems,
  presetsEmptyState,
  onChoosePreset,
}: {
  presetLabel: ReactNode;
  presetCount: ReactNode;
  disabled?: boolean;
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
            <SaveDialogCommand
              key={preset.id}
              type="button"
              disabled={disabled}
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
            </SaveDialogCommand>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProductSaveDialogSystemFolderButton({
  systemFolderLabel,
  systemFolderHint,
  disabled,
  onChooseSystemFolder,
}: {
  systemFolderLabel: ReactNode;
  systemFolderHint: ReactNode;
  disabled?: boolean;
  onChooseSystemFolder: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <SaveDialogCommand
      type="button"
      disabled={disabled}
      onClick={onChooseSystemFolder}
      className="sniptale-save-dialog-system"
    >
      <FolderInput size={18} className="sniptale-save-dialog-system-icon" />
      <span className="sniptale-save-dialog-system-copy">
        <span className="sniptale-save-dialog-system-label">{systemFolderLabel}</span>
        <span className="sniptale-save-dialog-system-hint">{systemFolderHint}</span>
      </span>
    </SaveDialogCommand>
  );
}
