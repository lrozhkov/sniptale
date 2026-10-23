import { MousePointer2, Palette, Clock3, Move, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import { PointerFeedbackFields } from '../../ui/pointer-feedback/fields';
import type { ReviewClickStyle } from '../../features/video/review/advanced/click-animation';
import { ReviewDetails, ReviewButton, reviewTextButtonClassName } from './controls';
import {
  reviewInformationSections,
  reviewInspectorActions,
  ReviewInspectorSections,
} from './inspector-sections';

/** Gallery composes local section metadata and commands around controlled pointer fields. */
export function ReviewClickFields(props: Parameters<typeof reviewClickSections>[0]) {
  return (
    <div className="min-w-0" data-ui="gallery.videoReview.clickFields">
      <ReviewInspectorSections sections={reviewClickSections(props)} />
    </div>
  );
}

export function reviewClickSections(props: {
  information?: ReactNode;
  gesture?: boolean;
  extraSections?: Parameters<typeof ReviewInspectorSections>[0]['sections'];
  values: readonly ReviewClickStyle[];
  onChange(patch: Partial<ReviewClickStyle> | null): void;
}) {
  const fields = (part: 'animation' | 'appearance' | 'timing' | 'position') => (
    <PointerFeedbackFields
      values={props.values}
      gesture={props.gesture}
      part={part}
      Details={ReviewDetails}
      onChange={props.onChange}
    />
  );
  const sections = reviewInformationSections(props.information);
  sections.push({
    id: 'animation',
    label: translate('gallery.videoReview.clickEffect'),
    icon: MousePointer2,
    content: fields('animation'),
  });
  if (!props.values.every((value) => value.effect === 'off')) {
    sections.push({
      id: 'appearance',
      label: translate('gallery.videoReview.clickAppearance'),
      icon: Palette,
      content: fields('appearance'),
    });
    if (!props.gesture)
      sections.push(
        {
          id: 'timing',
          label: translate('gallery.videoReview.clickTiming'),
          icon: Clock3,
          content: fields('timing'),
        },
        {
          id: 'position',
          label: translate('gallery.videoReview.clickPosition'),
          icon: Move,
          content: fields('position'),
        }
      );
  }
  if (props.extraSections) sections.push(...props.extraSections);
  sections.push(
    reviewInspectorActions(
      <ReviewButton
        className={`${reviewTextButtonClassName} !w-full justify-start`}
        label={translate('gallery.videoReview.clickReset')}
        onClick={() => props.onChange(null)}
      >
        <RotateCcw size={15} aria-hidden="true" />
        {translate('gallery.videoReview.clickReset')}
      </ReviewButton>
    )
  );
  return sections;
}
