import { Keyboard, Palette, Clock3, Move, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import { KeyboardFeedbackFields } from '../../ui/keyboard-feedback/fields';
import type {
  ReviewKeyStyle,
  ReviewKeyPatch,
} from '../../features/video/project/action-feedback/key-animation';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import {
  reviewInformationSections,
  reviewInspectorActions,
  ReviewInspectorSections,
} from './inspector-sections';

/** Gallery composes local section metadata around the shared controlled caption fields. */
export function ReviewKeyFields(props: Parameters<typeof reviewKeySections>[0]) {
  return (
    <div className="min-w-0" data-ui="gallery.videoReview.keyFields">
      <ReviewInspectorSections sections={reviewKeySections(props)} />
    </div>
  );
}

export function reviewKeySections(props: {
  information?: ReactNode;
  extraSections?: Parameters<typeof ReviewInspectorSections>[0]['sections'];
  values: readonly ReviewKeyStyle[];
  onChange(patch: ReviewKeyPatch | null): void;
}) {
  const fields = (part: 'display' | 'appearance' | 'timing' | 'position') => (
    <KeyboardFeedbackFields values={props.values} part={part} onChange={props.onChange} />
  );
  const sections = reviewInformationSections(props.information);
  sections.push({
    id: 'display',
    label: translate('gallery.videoReview.keyDisplay'),
    icon: Keyboard,
    content: fields('display'),
  });
  if (props.values.some((value) => value.enabled))
    sections.push(
      {
        id: 'appearance',
        label: translate('gallery.videoReview.clickAppearance'),
        icon: Palette,
        content: fields('appearance'),
      },
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
  if (props.extraSections) sections.push(...props.extraSections);
  sections.push(
    reviewInspectorActions(
      <ReviewButton
        className={`${reviewTextButtonClassName} !w-full justify-start`}
        label={translate('gallery.videoReview.keyReset')}
        onClick={() => props.onChange(null)}
      >
        <RotateCcw size={15} aria-hidden="true" />
        {translate('gallery.videoReview.keyReset')}
      </ReviewButton>
    )
  );
  return sections;
}
