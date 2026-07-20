import type { ChangeEvent, DragEvent, KeyboardEvent, RefObject } from 'react';
import { translate } from '../../../platform/i18n';
import { ImagePlus } from 'lucide-react';
import { ProductField, ProductInput } from '@sniptale/ui/product-form-controls';

type ScenarioImageStepDialogFieldsProps = {
  error: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onFileDrop: (files: FileList | null) => Promise<void>;
  onOpenFilePicker: () => void;
  onSearchChange: (value: string) => void;
  pending: boolean;
  search: string;
};

function ImageStepFileDropzoneContent() {
  return (
    <div className="grid max-w-[420px] gap-3 justify-items-center text-center">
      <span
        className="inline-flex h-12 w-12 items-center justify-center rounded-full border
          border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,white_8%)]
          text-[var(--sniptale-color-text-primary)]"
      >
        <ImagePlus className="h-5 w-5" />
      </span>
      <div className="grid gap-1">
        <span className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('scenario.editor.imageStepDialogDropzoneTitle')}
        </span>
        <span className="text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('scenario.editor.imageStepDialogDropzoneHint')}
        </span>
      </div>
    </div>
  );
}

function ImageStepFileDropzone(props: {
  onFileDrop: (files: FileList | null) => Promise<void>;
  onOpenFilePicker: () => void;
  pending: boolean;
}) {
  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (props.pending) {
      return;
    }

    void props.onFileDrop(event.dataTransfer.files);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      props.onOpenFilePicker();
    }
  };

  return (
    <button
      type="button"
      disabled={props.pending}
      data-ui="scenario.image-step-dropzone"
      onClick={props.onOpenFilePicker}
      onDrop={handleDrop}
      onDragOver={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
      className="grid min-h-[144px] place-items-center rounded-[24px] border border-dashed
        border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,var(--sniptale-color-border-strong)_28%)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_82%,transparent)] px-6 py-6
        text-left transition hover:border-[var(--sniptale-color-border-accent-strong)]
        hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_8%,var(--sniptale-color-surface-panel)_88%)]
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-[var(--sniptale-color-border-accent-strong)]
        disabled:cursor-wait disabled:opacity-60"
      aria-label={translate('scenario.editor.imageStepDialogDropzoneAction')}
    >
      <ImageStepFileDropzoneContent />
    </button>
  );
}

export function ScenarioImageStepDialogFields(props: ScenarioImageStepDialogFieldsProps) {
  return (
    <div className="grid gap-4">
      <input
        ref={props.fileInputRef}
        hidden
        accept="image/*"
        type="file"
        onChange={(event) => void props.onFileChange(event)}
      />
      <ImageStepFileDropzone
        pending={props.pending}
        onFileDrop={props.onFileDrop}
        onOpenFilePicker={props.onOpenFilePicker}
      />
      <ProductField label={translate('scenario.editor.imageStepDialogSearch')} error={props.error}>
        <ProductInput
          type="text"
          value={props.search}
          disabled={props.pending}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder={translate('scenario.editor.imageStepDialogSearch')}
        />
      </ProductField>
    </div>
  );
}
