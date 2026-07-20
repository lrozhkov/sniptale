import type { PromptTemplate } from '../../../../../../contracts/settings';
import { blurPromptIfFocused, createTemplateSelectHandler } from '../helpers';

type TemplatePillButtonProps = {
  dragStateMoved: boolean;
  isLoading: boolean;
  onSelectTemplate: (template: PromptTemplate) => void;
  template: PromptTemplate;
};

export function TemplatePillButton(props: TemplatePillButtonProps) {
  return (
    <button
      onMouseDown={() => blurPromptIfFocused()}
      onClick={createTemplateSelectHandler(props)}
      disabled={props.isLoading}
      title={props.template.content}
      type="button"
      className="sniptale-template-btn"
    >
      {props.template.name}
    </button>
  );
}
