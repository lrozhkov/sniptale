import type React from 'react';

import { translate } from '../../../../../platform/i18n';
import {
  ProductField,
  ProductKeyboardHint,
  ProductTextarea,
} from '@sniptale/ui/product-form-controls';
import type { useAIModalState } from '../session';

function AIModalPromptField(props: {
  disabled: boolean;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleResizeStart: (event: React.MouseEvent) => void;
  isResizing: boolean;
  prompt: string;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <ProductField label={translate('aiModal.promptLabel')}>
      <div style={{ position: 'relative' }}>
        <ProductTextarea
          ref={props.textareaRef as React.Ref<HTMLTextAreaElement>}
          id="ai-prompt"
          value={props.prompt}
          onChange={(event) => props.setPrompt(event.target.value)}
          onKeyDown={props.handleKeyDown}
          disabled={props.disabled}
          placeholder={translate('aiModal.promptPlaceholder')}
          style={{ marginBottom: 0, resize: 'none' }}
        />
        <div
          className={`sniptale-resizer ${props.isResizing ? 'active' : ''}`}
          onMouseDown={props.handleResizeStart}
        />
      </div>
      <div className="sniptale-ai-modal-kbd-hint">
        <ProductKeyboardHint shortcut="Ctrl+Enter">
          {translate('aiModal.submitShortcutSuffix')}
        </ProductKeyboardHint>
      </div>
    </ProductField>
  );
}

export function renderAIModalPromptField(
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void,
  isLoading: boolean | undefined,
  state: ReturnType<typeof useAIModalState>
) {
  return (
    <AIModalPromptField
      disabled={Boolean(isLoading)}
      handleKeyDown={handleKeyDown}
      handleResizeStart={state.handleResizeStart}
      isResizing={state.isResizing}
      prompt={state.prompt}
      setPrompt={state.setPrompt}
      textareaRef={state.textareaRef}
    />
  );
}
