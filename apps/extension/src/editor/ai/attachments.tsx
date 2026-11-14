import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Paperclip, X } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { blobToDataUrl } from '../../platform/media-utils/data-url';
import { readImageDataUrlDimensions } from '@sniptale/runtime-contracts/validation/data-url';
import { IMAGE_JOB_LIMITS, imageRasterSchema, type ImageRaster } from '../../contracts/ai/image';
import { EditorIconButton } from '../chrome/ui';
import { useImagePreview } from './preview';

/** Keeps local reference preparation bounded and discards uploads from an old operation. */
export function ImageAttachments(props: {
  operationId: string;
  controls?: ReactNode;
  source?: ImageRaster | null;
  sourceFromResult?: boolean;
  onRemoveSource?(): void;
  images: ImageRaster[];
  disabled: boolean;
  onPendingChange(pending: boolean): void;
  onChange(images: ImageRaster[]): void;
}) {
  const preview = useImagePreview();
  const input = useRef<HTMLInputElement>(null),
    generation = useRef({ value: 0 });
  const lifetime = generation.current;
  const onPendingChange = props.onPendingChange;
  const [reading, setReading] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    lifetime.value++;
    setReading(false);
    onPendingChange(false);
    setFailed(false);
    return () => {
      lifetime.value++;
    };
  }, [props.operationId, onPendingChange, lifetime]);
  const read = async (files: File[]) => {
    const current = ++lifetime.value;
    setReading(true);
    props.onPendingChange(true);
    setFailed(false);
    try {
      if (
        files.length + props.images.length > IMAGE_JOB_LIMITS.maxImages - 1 ||
        files.some(
          (file) =>
            !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
            file.size > IMAGE_JOB_LIMITS.maxImageBytes
        )
      )
        throw new Error('too-large');
      const bytes =
        files.reduce((sum, file) => sum + file.size, 0) +
        props.images.reduce((sum, image) => sum + image.dataUrl.length * 0.75, 0);
      if (bytes > IMAGE_JOB_LIMITS.maxInputBytes) throw new Error('too-large');
      const images: ImageRaster[] = [];
      for (const file of files) {
        const dataUrl = await blobToDataUrl(file);
        const size = readImageDataUrlDimensions(dataUrl, IMAGE_JOB_LIMITS.maxImageBytes);
        if (!size) throw new Error('invalid-image');
        images.push(imageRasterSchema.parse({ dataUrl, ...size }));
      }
      if (current === lifetime.value) props.onChange([...props.images, ...images]);
    } catch {
      if (current === lifetime.value) setFailed(true);
    } finally {
      if (current === lifetime.value) {
        setReading(false);
        props.onPendingChange(false);
      }
    }
  };
  return (
    <div className="space-y-2 pt-2" data-ui="editor.ai.attachments">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        aria-label={translate('editor.ai.addReferences')}
        disabled={props.disabled || reading}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          void read(files);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {props.controls}
        <EditorIconButton
          title={translate('editor.ai.addReferences')}
          className={[
            '!h-8 !w-8 !border-transparent !bg-transparent',
            'hover:!text-[var(--sniptale-color-text-primary-strong)]',
          ].join(' ')}
          disabled={props.disabled || reading}
          onClick={() => input.current?.click()}
        >
          <Paperclip size={20} />
        </EditorIconButton>
        {props.source ? (
          <ImageAttachmentTile
            image={props.source}
            label={translate('editor.ai.sourcePreview')}
            disabled={props.disabled}
            source
            onOpen={(trigger) =>
              props.sourceFromResult ? preview.openResult(trigger) : preview.openSource(trigger)
            }
            onRemove={() => props.onRemoveSource?.()}
          />
        ) : null}
        {props.images.map((image, index) => (
          <ImageAttachmentTile
            key={index}
            image={image}
            label={`${translate('editor.ai.references')} ${index + 1}`}
            disabled={props.disabled || reading}
            onOpen={(trigger) => preview.openAttachment(image, trigger)}
            onRemove={() => props.onChange(props.images.filter((_image, i) => i !== index))}
          />
        ))}
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
          {translate('editor.ai.fileError')}
        </p>
      ) : null}
    </div>
  );
}

/** Keeps each removable raster in one square target; opening never changes the document. */
function ImageAttachmentTile(props: {
  image: ImageRaster;
  label: string;
  disabled: boolean;
  source?: boolean;
  onOpen(trigger: HTMLElement): void;
  onRemove(): void;
}) {
  return (
    <div className="group relative h-8 w-8 shrink-0" data-ui="editor.ai.attachment-tile">
      <button
        type="button"
        title={`${props.label} · ${props.image.width} × ${props.image.height}`}
        aria-label={props.label}
        data-ui={props.source ? 'editor.ai.source-attachment' : 'editor.ai.reference-attachment'}
        className={[
          'h-8 w-8 rounded-[4px] border focus-visible:outline-2',
          'focus-visible:outline-[var(--sniptale-color-accent)]',
          props.source ? 'border-[var(--sniptale-color-accent)]' : 'border-transparent',
        ].join(' ')}
        onClick={(event) => props.onOpen(event.currentTarget)}
      >
        <img
          src={props.image.dataUrl}
          alt=""
          className="block h-full w-full rounded-[3px] object-cover"
        />
      </button>
      <button
        type="button"
        title={translate('editor.ai.removeReference')}
        aria-label={translate('editor.ai.removeReference')}
        disabled={props.disabled}
        data-ui={
          props.source
            ? 'editor.ai.source-attachment.remove'
            : 'editor.ai.reference-attachment.remove'
        }
        className={[
          'absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-[3px]',
          'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-secondary)]',
          'opacity-0 transition-opacity hover:text-[var(--sniptale-color-text-primary-strong)]',
          'focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100',
          'disabled:cursor-not-allowed',
        ].join(' ')}
        onClick={props.onRemove}
      >
        <X size={12} />
      </button>
    </div>
  );
}
