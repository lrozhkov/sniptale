import { GuideResourceTrigger } from './resource-drawer';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Upload } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { PROJECT_ASSET_IMAGE_MIME_TYPES } from '../../features/media-hub/project-assets';
import type { GuideImageImportPlacement } from '../../composition/persistence/scenario/store/public';
import type { Translate } from '../../platform/i18n';

/** Owns one disposable file choice; the page publishes through the existing image importer. */
export function GuideImageUpload({
  compact = false,
  frame,
  placement,
  disabled,
  onUpload,
  t,
}: {
  compact?: boolean;
  frame?: { width: number; height: number };
  placement: GuideImageImportPlacement;
  disabled: boolean;
  onUpload: (file: File, signal: AbortSignal) => Promise<boolean>;
  t: Translate;
}) {
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => operation.current?.abort(), []);
  const upload = async (file: File) => {
    if (disabled || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setPending(true);
    setFailed(false);
    try {
      const accepted = await onUpload(file, controller.signal);
      if (!controller.signal.aborted) setFailed(!accepted);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  return (
    <div
      className={compact ? 'guide-image-upload-compact' : 'guide-image-slot'}
      tabIndex={compact ? undefined : 0}
      aria-label={t('scenario.editor.guideAddImage')}
      aria-busy={pending}
      style={frame ? { aspectRatio: `${frame.width} / ${frame.height}` } : undefined}
    >
      {!compact && (
        <>
          <ImagePlus className="guide-image-slot-icon" size={24} aria-hidden="true" />
          <p>{t('scenario.editor.guideImageDropHint')}</p>
        </>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept={PROJECT_ASSET_IMAGE_MIME_TYPES.join(',')}
        aria-label={t('scenario.editor.guideImportFiles')}
        disabled={disabled || pending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
      <ProductActionButton
        type="button"
        compact
        tone="secondary"
        data-image-upload
        disabled={disabled || pending}
        onClick={() => input.current?.click()}
      >
        <Upload size={16} aria-hidden="true" />
        {t('scenario.editor.guideUploadImage')}
      </ProductActionButton>
      {<GuideResourceTrigger t={t} target={placement} disabled={disabled || pending} label />}
      {!compact && (
        <p className="guide-image-slot-hint">{t('scenario.editor.guideImagePasteHint')}</p>
      )}
      {pending && (
        <>
          <span role="status">{t('scenario.editor.guideImportProgress')}</span>
          <ProductActionButton
            type="button"
            compact
            tone="secondary"
            onClick={() => {
              operation.current?.abort();
              operation.current = null;
              setPending(false);
            }}
          >
            {t('scenario.editor.guideImportCancel')}
          </ProductActionButton>
        </>
      )}
      {failed && <p role="alert">{t('scenario.editor.guideImportFailed')}</p>}
    </div>
  );
}
