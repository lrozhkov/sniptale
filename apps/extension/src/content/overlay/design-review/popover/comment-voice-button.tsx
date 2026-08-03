import { translate } from '../../../../platform/i18n';
import { ContentVoiceInputButton } from '../../../voice-input/button';
import type { DesignReviewViewState } from '../types';

export function DesignReviewCommentVoiceButton(props: {
  disabled: boolean;
  onStart(): void;
  onStop(): void;
  state: DesignReviewViewState['voice'];
}) {
  return (
    <ContentVoiceInputButton
      dataUi="content.design-review.comment-voice-input"
      disabled={props.disabled}
      labels={{
        error: translate('content.designReview.voiceInputError'),
        start: translate('content.designReview.voiceInputStart'),
        stop: translate('content.designReview.voiceInputStop'),
      }}
      onStart={props.onStart}
      onStop={props.onStop}
      state={props.state}
    />
  );
}
