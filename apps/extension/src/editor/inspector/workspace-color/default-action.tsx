import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../../platform/i18n';
import { cx } from '../../chrome/ui';
import { panelButtonClassName } from '../environment/shared';

const workspaceDefaultErrorClassName = [
  'rounded-[4px] border border-[color:var(--sniptale-color-danger)] px-3 py-2',
  'text-xs font-medium text-[color:var(--sniptale-color-danger)]',
].join(' ');

interface WorkspaceDefaultActionProps {
  error: string | null;
  isPending: boolean;
  matchesDefault: boolean;
  onSaveAsDefault: () => Promise<void> | void;
  variant?: 'compact' | 'expanded';
}

export function WorkspaceDefaultAction({
  error,
  isPending,
  matchesDefault,
  onSaveAsDefault,
  variant = 'expanded',
}: WorkspaceDefaultActionProps) {
  const isDisabled = isPending || matchesDefault;

  return (
    <div className={variant === 'compact' ? 'contents' : 'space-y-2'}>
      <ProductActionButton
        compact
        tone="secondary"
        type="button"
        aria-label={translate('editor.compact.workspaceMakeDefault')}
        title={translate('editor.compact.workspaceMakeDefault')}
        disabled={isDisabled}
        onClick={() => {
          void onSaveAsDefault();
        }}
        className={cx(
          panelButtonClassName,
          'disabled:cursor-not-allowed disabled:opacity-50',
          variant === 'compact' ? 'shrink-0 px-2 text-[12px]' : 'px-3.5'
        )}
      >
        {isPending
          ? translate('common.states.saving')
          : translate('editor.compact.workspaceMakeDefault')}
      </ProductActionButton>
      {error ? (
        <div
          role="alert"
          className={cx(workspaceDefaultErrorClassName, variant === 'compact' && 'col-span-2')}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
