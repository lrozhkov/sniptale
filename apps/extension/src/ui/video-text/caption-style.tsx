import type { ReactNode } from 'react';
import type { ReviewCaptionStyle } from '../../features/video/review/text-types';
import { translate } from '../../platform/i18n';
import { ColorField, SegmentedRow } from '../compact-inspector-controls';

/** Both editors share appearance fields; each adapter retains numeric gesture publication. */
export function CaptionStyleFields(props: {
  style: ReviewCaptionStyle;
  disabled?: boolean;
  dataUi?: string;
  sizeControl: ReactNode;
  onChange(style: ReviewCaptionStyle): void;
}) {
  const patch = (value: Partial<ReviewCaptionStyle>) =>
    props.onChange({ ...props.style, ...value });
  return (
    <fieldset disabled={props.disabled} className="min-w-0 space-y-1" data-ui={props.dataUi}>
      <SegmentedRow
        ariaLabel={translate('gallery.videoReview.captionPosition')}
        columns={2}
        label={translate('gallery.videoReview.captionPosition')}
        value={props.style.position}
        options={[
          { value: 'bottom' as const, label: translate('gallery.videoReview.captionBottom') },
          { value: 'top' as const, label: translate('gallery.videoReview.captionTop') },
        ]}
        onChange={(position) => patch({ position })}
      />
      {props.sizeControl}
      <ColorField
        className="w-full min-w-0"
        label={translate('gallery.videoReview.captionColor')}
        title={translate('gallery.videoReview.captionColor')}
        value={props.style.color}
        disabled={props.disabled ?? false}
        onChange={(color) => patch({ color })}
      />
      <ColorField
        className="w-full min-w-0"
        label={translate('gallery.videoReview.captionBackground')}
        title={translate('gallery.videoReview.captionBackground')}
        value={props.style.background}
        disabled={props.disabled ?? false}
        onChange={(background) => patch({ background })}
      />
    </fieldset>
  );
}
