import { ArrowDown, ArrowUp, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { ViewportPreset } from '../../../../contracts/settings';
import {
  getSettingsHoverActionsClassName,
  SettingsSwitch,
} from '../../../section-surface/panel-controls';

const compactActionButtonClassName = [
  'inline-flex h-7 w-7 items-center justify-center rounded-[7px]',
  'text-[var(--sniptale-color-text-muted)] transition-colors',
  'hover:bg-[var(--sniptale-color-surface-hover)] hover:text-[var(--sniptale-color-text-primary)]',
  'disabled:cursor-not-allowed disabled:opacity-30',
].join(' ');

function ActionButton(props: {
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={compactActionButtonClassName}
      title={props.title}
    >
      {props.children}
    </button>
  );
}

export function PresetRowActions(props: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  isHovered: boolean;
  isLoading: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onReset: () => void;
  onToggle: () => void;
  preset: ViewportPreset;
}) {
  return (
    <div className={getSettingsHoverActionsClassName(props.isHovered)}>
      <SettingsSwitch
        checked={props.preset.enabled}
        disabled={props.isLoading}
        size="sm"
        onClick={props.onToggle}
        title={translate(
          props.preset.enabled
            ? 'viewportPresets.actions.disable'
            : 'viewportPresets.actions.enable'
        )}
      />
      <ActionButton
        disabled={props.isLoading || !props.canMoveUp}
        onClick={() => props.onMove(-1)}
        title={translate('viewportPresets.actions.moveUp')}
      >
        <ArrowUp size={14} />
      </ActionButton>
      <ActionButton
        disabled={props.isLoading || !props.canMoveDown}
        onClick={() => props.onMove(1)}
        title={translate('viewportPresets.actions.moveDown')}
      >
        <ArrowDown size={14} />
      </ActionButton>
      <ActionButton
        disabled={props.isLoading}
        onClick={props.onEdit}
        title={translate('common.actions.edit')}
      >
        <Pencil size={14} />
      </ActionButton>
      {props.preset.kind === 'system' && props.preset.customized ? (
        <ActionButton
          disabled={props.isLoading}
          onClick={props.onReset}
          title={translate('viewportPresets.actions.reset')}
        >
          <RotateCcw size={14} />
        </ActionButton>
      ) : null}
      {props.preset.kind === 'user' ? (
        <button
          type="button"
          disabled={props.isLoading}
          onClick={props.onDelete}
          className={`${compactActionButtonClassName} hover:text-[var(--sniptale-color-danger)]`}
          title={translate('common.actions.delete')}
        >
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  );
}
