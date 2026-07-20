import { CheckSquare, ListCollapse, ListTree, Square } from 'lucide-react';
import { translate } from '../../../../platform/i18n';

export function AutoBlurTableActions(props: {
  isAnyExpanded: boolean;
  isAnySelected: boolean;
  toggleExpandAll: () => void;
  toggleSelectAll: () => void;
}) {
  return (
    <div className="sniptale-ai-spoiler-actions">
      <button
        type="button"
        className="sniptale-ctrl-btn"
        onClick={props.toggleExpandAll}
        title={
          props.isAnyExpanded
            ? translate('content.autoBlur.collapseAllTitle')
            : translate('content.autoBlur.expandAllTitle')
        }
      >
        {props.isAnyExpanded ? (
          <ListCollapse className="h-3.5 w-3.5" />
        ) : (
          <ListTree className="h-3.5 w-3.5" />
        )}
        {props.isAnyExpanded
          ? translate('content.autoBlur.collapseAllButton')
          : translate('content.autoBlur.expandAllButton')}
      </button>
      <button
        type="button"
        className={`sniptale-ctrl-btn${props.isAnySelected ? ' active' : ''}`}
        onClick={props.toggleSelectAll}
        title={
          props.isAnySelected
            ? translate('content.autoBlur.clearSelectionTitle')
            : translate('content.autoBlur.selectAllTitle')
        }
      >
        {props.isAnySelected ? (
          <CheckSquare className="h-3.5 w-3.5" />
        ) : (
          <Square className="h-3.5 w-3.5" />
        )}
        {props.isAnySelected
          ? translate('content.autoBlur.clearSelectionButton')
          : translate('content.autoBlur.selectAllButton')}
      </button>
    </div>
  );
}
