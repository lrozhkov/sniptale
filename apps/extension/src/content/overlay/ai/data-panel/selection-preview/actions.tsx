import { translate } from '../../../../../platform/i18n';
import { CheckboxIcon, CheckIcon, ExpandChevronIcon } from '../preview/icons';

type DataSelectionPreviewActionsProps = {
  isAnyExpanded: boolean;
  isAnySelected: boolean;
  isLoading: boolean;
  toggleExpandAll: () => void;
  toggleSelectAll: () => void;
};

export function DataSelectionPreviewActions({
  isAnyExpanded,
  isAnySelected,
  isLoading,
  toggleExpandAll,
  toggleSelectAll,
}: DataSelectionPreviewActionsProps) {
  return (
    <div className="sniptale-ai-spoiler-actions" onClick={(event) => event.stopPropagation()}>
      <button
        className="sniptale-ctrl-btn"
        onClick={toggleExpandAll}
        disabled={isLoading}
        title={
          isAnyExpanded
            ? translate('aiModal.collapseAllGroupsTitle')
            : translate('aiModal.expandAllGroupsTitle')
        }
      >
        <ExpandChevronIcon expanded={isAnyExpanded} size={10} />
        {isAnyExpanded
          ? translate('aiModal.collapseAllButton')
          : translate('aiModal.expandAllButton')}
      </button>
      <button
        className={`sniptale-ctrl-btn${isAnySelected ? ' active' : ''}`}
        onClick={toggleSelectAll}
        disabled={isLoading}
        title={
          isAnySelected
            ? translate('aiModal.clearSelectionTitle')
            : translate('aiModal.selectAllTitle')
        }
      >
        {isAnySelected ? <CheckIcon /> : <CheckboxIcon />}
        {isAnySelected
          ? translate('aiModal.clearSelectionButton')
          : translate('aiModal.selectAllButton')}
      </button>
    </div>
  );
}
