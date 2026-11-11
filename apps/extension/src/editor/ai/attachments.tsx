import { useEffect, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { blobToDataUrl } from '../../platform/media-utils/data-url';
import { readImageDataUrlDimensions } from '@sniptale/runtime-contracts/validation/data-url';
import { IMAGE_JOB_LIMITS, imageRasterSchema, type ImageRaster } from '../../contracts/ai/image';
import { EditorIconButton } from '../chrome/ui';

/** Keeps local reference preparation bounded and discards uploads from an old operation. */
export function ImageAttachments(props: {
  operationId: string;
  images: ImageRaster[];
  disabled: boolean;
  onPendingChange(pending: boolean): void;
  onChange(images: ImageRaster[]): void;
}) {
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
    <div className="space-y-2">
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
        <EditorIconButton
          title={translate('editor.ai.addReferences')}
          disabled={props.disabled || reading}
          onClick={() => input.current?.click()}
        >
          <Paperclip size={15} />
        </EditorIconButton>
        <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('editor.ai.references')}
          {props.images.length ? ` · ${props.images.length}` : ''}
        </span>
        {props.images.map((image, index) => (
          <div key={index} className="relative">
            <details>
              <summary className="cursor-pointer">
                <img
                  src={image.dataUrl}
                  alt={`${translate('editor.ai.references')} ${index + 1}`}
                  className="h-10 w-10 rounded-[4px] object-contain"
                />
              </summary>
              <img
                src={image.dataUrl}
                alt={translate('editor.ai.sourcePreview')}
                className="max-h-56 max-w-full object-contain"
              />
            </details>
            <EditorIconButton
              title={translate('editor.ai.removeReference')}
              disabled={props.disabled || reading}
              className="absolute -right-1 -top-1 !h-5 !w-5"
              onClick={() => props.onChange(props.images.filter((_image, i) => i !== index))}
            >
              <X size={12} />
            </EditorIconButton>
          </div>
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
