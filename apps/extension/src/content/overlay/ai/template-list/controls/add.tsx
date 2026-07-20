import { translate } from '../../../../../platform/i18n';

type TemplateListAddButtonProps = {
  isLoading: boolean;
  onAddTemplate: () => void;
};

function AddTemplateIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function TemplateListAddButton({ isLoading, onAddTemplate }: TemplateListAddButtonProps) {
  return (
    <button
      onClick={onAddTemplate}
      disabled={isLoading}
      title={`${translate('common.actions.add')}${translate('aiModal.addTemplateTitleSuffix')}`}
      type="button"
      className="sniptale-add-btn"
    >
      <AddTemplateIcon />
      {translate('common.actions.add')}
    </button>
  );
}
