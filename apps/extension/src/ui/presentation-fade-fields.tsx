import type { ReactNode } from 'react';
import type { PresentationFade } from '../features/video/project/scene/edge-fades';
import { translate, useAppLocale } from '../platform/i18n';
import { ColorField, ToggleField } from './compact-inspector-controls';
import { PreviewNumericRow } from './compact-inspector-controls/numeric-preview';

/** Controlled scalar fields share geometry; each editor retains its admission and clock. */
export function PresentationFadeFields(props: {
  value: PresentationFade;
  duration?: number;
  fallbackColor: string;
  fallbackAudioFade: boolean;
  enabledLabel?: string;
  colorClassName?: string;
  onChange(patch: Partial<PresentationFade>): void;
  onPreview(patch: Partial<PresentationFade> | null): void;
  children?: ReactNode;
}) {
  useAppLocale();
  return (
    <div className="min-w-0 space-y-1" data-ui="shared.ui.presentation-fade-fields">
      {props.enabledLabel && (
        <ToggleField
          label={props.enabledLabel}
          value={props.value.enabled}
          onChange={(enabled) => props.onChange({ enabled })}
        />
      )}
      {(!props.enabledLabel || props.value.enabled) && (
        <>
          <PreviewNumericRow
            label={translate('gallery.videoReview.presentationDuration')}
            value={props.duration ?? props.value.duration}
            min={0}
            max={60}
            scrubMax={3}
            step={0.1}
            unit="s"
            precision={2}
            onChange={(duration) => props.onChange({ duration })}
            onPreview={(duration) => props.onPreview(duration === null ? null : { duration })}
          />
          <ColorField
            {...(props.colorClassName ? { className: props.colorClassName } : {})}
            label={translate('gallery.videoReview.presentationFadeColor')}
            title={translate('gallery.videoReview.presentationFadeColor')}
            value={props.value.color ?? props.fallbackColor}
            allowAlpha={false}
            allowTransparent={false}
            onChange={(color) => props.onChange({ color })}
            onPreviewChange={(color) => props.onPreview(color ? { color } : null)}
            onPreviewReset={() => props.onPreview(null)}
          />
          <ToggleField
            label={translate('gallery.videoReview.presentationAudioFade')}
            value={props.value.audioFade ?? props.fallbackAudioFade}
            onChange={(audioFade) => props.onChange({ audioFade })}
          />
          {props.children}
        </>
      )}
    </div>
  );
}
