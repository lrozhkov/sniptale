import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { CheckSquare, ListCollapse, ListTree, Square } from 'lucide-react';
import { translate } from '../../../../platform/i18n';

export function AutoBlurTableActions(props: {
  isAnyExpanded: boolean;
  isAnySelected: boolean;
  toggleExpandAll: () => void;
  toggleSelectAll: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <ProductActionButton
        compact
        tone="secondary"
        type="button"
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
      </ProductActionButton>
      <ProductActionButton
        compact
        tone="secondary"
        type="button"
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
      </ProductActionButton>
    </div>
  );
}
