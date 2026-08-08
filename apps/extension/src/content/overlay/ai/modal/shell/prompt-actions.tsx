import { CornerDownLeft } from 'lucide-react';

import type { useAIModalState } from '../session';
import { AIModalPromptTemplatePicker } from './prompt-template-picker';
import { AIModalPromptVoiceButton } from './prompt-voice-button';

type AIModalPromptActionsProps = {
  onSelectTemplate: ReturnType<typeof useAIModalState>['handleSelectTemplate'];
  prompt: string;
  templates: ReturnType<typeof useAIModalState>['templates'];
  templatesLoading: boolean;
  textareaRef: ReturnType<typeof useAIModalState>['textareaRef'];
  voice: ReturnType<typeof useAIModalState>['voice'];
};

export function AIModalPromptActions(props: AIModalPromptActionsProps) {
  return (
    <>
      <AIModalPromptTemplatePicker
        disabled={false}
        isLoading={props.templatesLoading}
        onSelectTemplate={props.onSelectTemplate}
        templates={props.templates}
      />
      <AIModalPromptVoiceButton
        disabled={false}
        onStart={() => {
          const textarea = props.textareaRef.current;
          props.voice.actions.start(props.prompt, textarea?.selectionStart ?? props.prompt.length);
        }}
        voice={props.voice}
      />
      <span aria-hidden="true" className="sniptale-ai-modal-prompt-submit-hint">
        <CornerDownLeft size={14} strokeWidth={1.8} />
      </span>
    </>
  );
}
