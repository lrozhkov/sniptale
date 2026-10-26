import { useEffect, useRef, useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { QuickActionAppearance } from '../../../../../contracts/quick-action-appearance';
import { WindowHeaderSettings } from '../../../../../workflows/browser-frame/settings';
import {
  importWindowHeaderIcon,
  WINDOW_HEADER_ICON_ACCEPT,
} from '../../../../../workflows/browser-frame/local-icon';
import { SelectField, TextField, ToggleField } from '../../../../../ui/compact-inspector-controls';
import { translate } from '../../../../../platform/i18n';

type AppearanceSettingsProps = {
  value: QuickActionAppearance;
  onChange(value: QuickActionAppearance): void;
};

function useUploadedQuickActionIcon(props: AppearanceSettingsProps) {
  const latest = useRef(props);
  latest.current = props;
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
  }, [props.value.faviconMode, props.value.header?.kind, props.value.header?.faviconEnabled]);
  const upload = async (file: File) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(false);
    try {
      const icon = await importWindowHeaderIcon(file, controller.signal);
      controller.signal.throwIfAborted();
      if (!icon) throw new Error('Icon is unavailable');
      const current = latest.current;
      if (current.value.header?.kind !== 'browser' || current.value.faviconMode !== 'upload')
        return;
      current.onChange({
        ...current.value,
        header: {
          ...current.value.header,
          faviconEnabled: true,
          faviconSource: 'file',
          faviconDataUrl: icon,
        },
      });
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (request.current === controller && !controller.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  };
  return { input, busy, error, upload };
}

function QuickActionFaviconSettings(props: AppearanceSettingsProps) {
  const { input, busy, error, upload } = useUploadedQuickActionIcon(props);
  const update = (patch: Partial<QuickActionAppearance>) =>
    props.onChange({ ...props.value, ...patch });
  const header = props.value.header;
  const clearIcon = (enabled: boolean) => {
    if (!header) return;
    const { faviconDataUrl: _icon, faviconSource: _source, ...rest } = header;
    update({ header: { ...rest, faviconEnabled: enabled } });
  };
  if (!header || header.kind !== 'browser') return null;
  return (
    <>
      <ToggleField
        label={translate('settings.quickActions.appearanceIconEnabled')}
        value={header.faviconEnabled}
        onChange={clearIcon}
      />
      {header.faviconEnabled ? (
        <>
          <SelectField
            label={translate('settings.quickActions.appearanceIconSource')}
            value={props.value.faviconMode}
            options={[
              { value: 'page', label: translate('settings.quickActions.appearanceIconPage') },
              {
                value: 'upload',
                label: translate('settings.quickActions.appearanceIconUpload'),
              },
              {
                value: 'website',
                label: translate('settings.quickActions.appearanceIconWebsite'),
              },
            ]}
            onChange={(faviconMode) => {
              const { faviconDataUrl: _icon, faviconSource: _source, ...rest } = header;
              update({ faviconMode, header: rest });
            }}
          />
          {props.value.faviconMode === 'website' ? (
            <TextField
              label={translate('settings.quickActions.appearanceIconWebsiteAddress')}
              value={props.value.faviconWebsite}
              maxLength={2048}
              onChange={(event) => update({ faviconWebsite: event.target.value })}
            />
          ) : null}
          {props.value.faviconMode === 'upload' ? (
            <>
              <input
                ref={input}
                type="file"
                accept={WINDOW_HEADER_ICON_ACCEPT}
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void upload(file);
                }}
              />
              <ProductActionButton
                tone="secondary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {translate('settings.quickActions.appearanceUploadIcon')}
              </ProductActionButton>
              {header.faviconDataUrl ? (
                <img src={header.faviconDataUrl} width={24} height={24} alt="" />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
          {translate('windowHeader.fileUnavailable')}
        </p>
      ) : null}
    </>
  );
}

export function QuickActionHeaderSettings(props: AppearanceSettingsProps) {
  const update = (patch: Partial<QuickActionAppearance>) =>
    props.onChange({ ...props.value, ...patch });
  const sourceOptions = [
    { value: 'page' as const, label: translate('settings.quickActions.appearancePageSource') },
    { value: 'static' as const, label: translate('settings.quickActions.appearanceStaticSource') },
  ];
  const header = props.value.header;
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.quickActions.appearanceSourcesHint')}
      </p>
      <WindowHeaderSettings
        header={header ?? undefined}
        onChange={(next) => update({ header: next ?? null })}
        titleField={
          <div className="min-w-0 space-y-2">
            <SelectField
              label={translate('settings.quickActions.appearanceTitleSource')}
              value={props.value.titleSource}
              options={sourceOptions}
              onChange={(titleSource) => update({ titleSource })}
            />
            {props.value.titleSource === 'static' && header ? (
              <TextField
                label={translate(
                  header.kind === 'browser' ? 'windowHeader.tabTitle' : 'windowHeader.windowTitle'
                )}
                value={header.title}
                maxLength={512}
                onChange={(event) => update({ header: { ...header, title: event.target.value } })}
              />
            ) : null}
          </div>
        }
        addressField={
          <div className="min-w-0 flex-1 space-y-2">
            <SelectField
              label={translate('settings.quickActions.appearanceAddressSource')}
              value={props.value.addressSource}
              options={sourceOptions}
              onChange={(addressSource) => update({ addressSource })}
            />
            {props.value.addressSource === 'static' && header ? (
              <TextField
                label={translate('windowHeader.address')}
                value={header.url}
                maxLength={2048}
                onChange={(event) => update({ header: { ...header, url: event.target.value } })}
              />
            ) : null}
          </div>
        }
        faviconControls={<span />}
      />
      {header?.kind === 'browser' ? <QuickActionFaviconSettings {...props} /> : null}
    </div>
  );
}
