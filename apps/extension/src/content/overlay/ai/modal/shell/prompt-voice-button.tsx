import { translate } from '../../../../../platform/i18n';
import { ContentVoiceInputButton } from '../../../../voice-input/button';
import type { useAIModalState } from '../session';

export function AIModalPromptVoiceButton(props: {
  disabled: boolean;
  onStart(): void;
  voice: ReturnType<typeof useAIModalState>['voice'];
}) {
  return (
    <div
      className="sniptale-ai-modal-prompt-voice-control"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.preventDefault()}
    >
      <ContentVoiceInputButton
        dataUi="content.ai-modal.prompt-voice-input"
        disabled={props.disabled}
        labels={{
          error: translate('aiModal.voiceInputError'),
          start: translate('aiModal.voiceInputStart'),
          stop: translate('aiModal.voiceInputStop'),
        }}
        onStart={props.onStart}
        onStop={props.voice.actions.stop}
        state={props.voice.state}
      />
    </div>
  );
}
