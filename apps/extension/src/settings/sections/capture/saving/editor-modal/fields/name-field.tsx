import { useRef, type Dispatch, type SetStateAction } from 'react';

import { translate } from '../../../../../../platform/i18n';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { InspectorFieldClear } from '../../../../../../ui/compact-inspector-controls/text-field';
import { SettingsControlRow } from '../../../../../section-surface';

export function SavePresetNameField(props: {
  name: string;
  setName: Dispatch<SetStateAction<string>>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const label = translate('savePresets.editor.nameLabel');
  return (
    <SettingsControlRow label={label}>
      <div className="sniptale-text-value">
        <ProductInput
          ref={input}
          type="text"
          aria-label={label}
          value={props.name}
          onChange={(event) => props.setName(event.target.value)}
          placeholder={translate('savePresets.editor.namePlaceholder')}
          maxLength={80}
        />
        {props.name ? <InspectorFieldClear label={label} target={input} /> : null}
      </div>
    </SettingsControlRow>
  );
}
