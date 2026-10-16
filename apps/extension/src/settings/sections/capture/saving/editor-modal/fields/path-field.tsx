import { SettingsControlRow } from '../../../../../section-surface';
import { InspectorFieldClear } from '../../../../../../ui/compact-inspector-controls/text-field';
import { useRef, type Dispatch, type SetStateAction } from 'react';

import { translate } from '../../../../../../platform/i18n';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { sanitizePresetPathInput } from '@sniptale/foundation/utils/preset-path';

export function SavePresetPathField(props: {
  path: string;
  setPath: Dispatch<SetStateAction<string>>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const label = translate('savePresets.editor.pathLabel');
  return (
    <div>
      <SettingsControlRow label={label}>
        <div className="flex flex-wrap items-center gap-1">
          <span className="whitespace-nowrap text-xs text-[var(--sniptale-color-text-dim)]">
            {translate('savePresets.editor.downloadsPrefix')}
          </span>
          <div className="sniptale-text-value min-w-[120px] flex-1">
            <ProductInput
              ref={input}
              id="save-preset-path"
              aria-label={label}
              type="text"
              value={props.path}
              onChange={(event) => props.setPath(sanitizePresetPathInput(event.target.value))}
              className="w-full"
              placeholder={translate('savePresets.editor.pathPlaceholder')}
            />
            {props.path ? <InspectorFieldClear label={label} target={input} /> : null}
          </div>
          <span className="text-xs text-[var(--sniptale-color-text-dim)]">
            {translate('savePresets.editor.downloadsSuffix')}
          </span>
        </div>
      </SettingsControlRow>
      <p className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">
        {translate('savePresets.editor.pathHint')}
      </p>
    </div>
  );
}
