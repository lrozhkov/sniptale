import { translate } from '../../../../../platform/i18n';
import { PopupIconStateButton } from '../../../../../ui/popup-shell/icon-state-button';
import {
  getContentOptionConfigs,
  getDiagnosticsOptionConfigs,
  getExportOptionActive,
  getExportOptionDisabled,
  toggleExportOption,
  type ExportOptionConfig,
  type ExportOptionToggleProps,
} from './data';

const contentToggleGridClassName = 'grid grid-cols-4 gap-1.5';
const diagnosticsToggleGridClassName = 'grid grid-cols-4 gap-1.5';
const optionGroupTitleClassName = [
  'mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]',
  'text-[var(--sniptale-color-text-dim)]',
].join(' ');

function ExportOptionButton(props: {
  icon: ExportOptionConfig['icon'];
  label: string;
  description: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  accentClassName: string;
}) {
  return (
    <PopupIconStateButton
      icon={props.icon}
      label={props.label}
      description={props.description}
      active={props.active}
      disabled={props.disabled}
      onClick={props.onClick}
      accentClassName={props.accentClassName}
      inactiveDecoration="slash"
      layout="stacked"
    />
  );
}

function ExportOptionGroup(props: {
  gridClassName: string;
  items: ExportOptionConfig[];
  title: string;
  toggles: ExportOptionToggleProps;
}) {
  return (
    <div>
      <div className={optionGroupTitleClassName}>{props.title}</div>
      <div className={props.gridClassName}>
        {props.items.map((option) => (
          <ExportOptionButton
            key={option.key}
            icon={option.icon}
            label={option.label}
            description={option.description}
            accentClassName={option.accentClassName}
            disabled={getExportOptionDisabled(option.key, props.toggles)}
            active={getExportOptionActive(option.key, props.toggles)}
            onClick={() => toggleExportOption(option.key, props.toggles)}
          />
        ))}
      </div>
    </div>
  );
}

export function ExportOptionToggles(props: ExportOptionToggleProps) {
  return (
    <div className="space-y-3">
      <ExportOptionGroup
        gridClassName={contentToggleGridClassName}
        items={getContentOptionConfigs()}
        title={translate('popup.export.contentGroupLabel')}
        toggles={props}
      />
      <ExportOptionGroup
        gridClassName={diagnosticsToggleGridClassName}
        items={getDiagnosticsOptionConfigs()}
        title={translate('popup.export.diagnosticsGroupLabel')}
        toggles={props}
      />
    </div>
  );
}
