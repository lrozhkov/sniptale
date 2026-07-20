import React from 'react';

import { SelectField, type CompactSelectOption } from '../../../chrome/ui';

export function EditorInspectorFrameModeButtons<T extends string>(props: {
  ariaLabel?: string;
  options: CompactSelectOption<T>[];
  value: T;
  onChange: (next: T) => void;
}): React.ReactElement {
  return (
    <SelectField
      label={props.ariaLabel ?? ''}
      onChange={props.onChange}
      options={props.options}
      value={props.value}
    />
  );
}
