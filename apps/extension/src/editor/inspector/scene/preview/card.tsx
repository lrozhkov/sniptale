import type React from 'react';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';
import { normalizeEditorImageSettings } from '../../../../features/editor/document/constants';
import { resolveEditorSourceImageGlowBlur } from '../../../../features/editor/document/image-types';

const PREVIEW_CLASS_NAME = [
  'grid h-32 overflow-hidden rounded-[12px] transition-[padding] duration-150',
  'motion-reduce:transition-none',
].join(' ');
const SOURCE_PREVIEW_CLASS_NAME = [
  'min-h-0 min-w-0 bg-[color:var(--sniptale-color-surface-panel)]',
  'transition-[border-radius,box-shadow,opacity] duration-150 motion-reduce:transition-none',
].join(' ');

function resolvePreviewPadding(frame: EditorFrameSettings) {
  return [frame.paddingTop, frame.paddingRight, frame.paddingBottom, frame.paddingLeft]
    .map((value) => `${Math.min(value, 28)}px`)
    .join(' ');
}

function resolvePreviewShadow(sourceImage: ReturnType<typeof normalizeEditorImageSettings>) {
  if (sourceImage.shadow <= 0) return 'none';
  const opacity = Math.min(0.45, sourceImage.shadow / 180);
  const blur = resolveEditorSourceImageGlowBlur(sourceImage);
  const color = sourceImage.shadowColor ?? '#000000';
  return `0 0 ${blur}px color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}

export function EditorInspectorFramePreviewCard(props: {
  backgroundPreviewStyle: React.CSSProperties;
  frameDraft: EditorFrameSettings;
}) {
  const sourceImage = normalizeEditorImageSettings(props.frameDraft.sourceImage);
  const padding = resolvePreviewPadding(props.frameDraft);
  return (
    <div
      className={
        'rounded-[16px] border border-[color:var(--sniptale-color-border-soft)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_78%,transparent)] p-3'
      }
    >
      <div
        data-testid="frame-preview"
        className={PREVIEW_CLASS_NAME}
        style={{ ...props.backgroundPreviewStyle, padding }}
      >
        <div
          data-testid="frame-preview-source"
          className={SOURCE_PREVIEW_CLASS_NAME}
          style={{
            borderRadius: sourceImage.radius,
            opacity: 1,
            boxShadow: resolvePreviewShadow(sourceImage),
          }}
        />
      </div>
    </div>
  );
}
