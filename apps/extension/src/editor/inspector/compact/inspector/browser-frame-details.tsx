import { translate } from '../../../../platform/i18n';
import { fireAndReportEditorAction } from '../../../runtime/async-actions';
import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import type { InspectorCommandParams } from './command-types';
import { TextField } from '../../../chrome/ui';

function buildBrowserFramePresetCommand(): CompactCommand {
  return {
    id: 'browser-frame-preset',
    icon: 'browser',
    title: translate('editor.compact.browserPreset'),
    trigger: <CompactCommandToken>PRE</CompactCommandToken>,
    value: translate('editor.compact.browserPresetCanonical'),
    content: (
      <CompactCommandField
        label={translate('editor.compact.browserPreset')}
        value={translate('editor.compact.browserPresetCanonical')}
      >
        <div className="text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('editor.compact.browserPresetCanonical')}
        </div>
      </CompactCommandField>
    ),
  };
}

function buildBrowserFrameTextCommand(args: {
  action: string;
  commandId: string;
  icon: Exclude<CompactCommand['icon'], undefined>;
  label: string;
  placeholder: string;
  trigger: string;
  value: string;
  onChange: (value: string) => Promise<void> | void;
}) {
  return {
    id: args.commandId,
    icon: args.icon,
    title: args.label,
    trigger: <CompactCommandToken>{args.trigger}</CompactCommandToken>,
    value: args.value || translate('editor.compact.empty'),
    content: (
      <CompactCommandField
        hideLabel
        label={args.label}
        value={args.value || translate('editor.compact.empty')}
      >
        <TextField
          aria-label={args.label}
          label={args.label}
          placeholder={args.placeholder}
          value={args.value}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            fireAndReportEditorAction(args.action, () => args.onChange(nextValue));
          }}
        />
      </CompactCommandField>
    ),
  } satisfies CompactCommand;
}

export function buildBrowserFrameDetailCommands(params: InspectorCommandParams): CompactCommand[] {
  return [
    buildBrowserFramePresetCommand(),
    buildBrowserFrameTextCommand({
      action: 'compact-browser-frame-title',
      commandId: 'browser-frame-title',
      icon: 'text',
      label: translate('editor.compact.browserTabTitle'),
      placeholder: translate('editor.compact.pageTitlePlaceholder'),
      trigger: 'TAB',
      value: params.browserFrame.title,
      onChange: (title) => params.syncBrowserFrame({ title }),
    }),
    buildBrowserFrameTextCommand({
      action: 'compact-browser-frame-url',
      commandId: 'browser-frame-url',
      icon: 'link',
      label: translate('editor.compact.urlMockup'),
      placeholder: translate('editor.compact.urlPlaceholder'),
      trigger: 'URL',
      value: params.browserFrame.url,
      onChange: (url) => params.syncBrowserFrame({ url }),
    }),
  ];
}
