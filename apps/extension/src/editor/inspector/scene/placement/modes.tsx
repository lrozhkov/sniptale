import React from 'react';
import { SegmentedRow } from '../../../../ui/compact-inspector-controls';

import type { CompactSelectOption } from '../../../chrome/ui';

function resolveModeColumns(count: number): 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(2, count)) as 2 | 3 | 4 | 5;
}

export function EditorInspectorFrameModeButtons<T extends string>(props: {
  ariaLabel?: string;
  options: CompactSelectOption<T>[];
  value: T;
  onChange: (next: T) => void;
}): React.ReactElement {
  return (
    <SegmentedRow
      ariaLabel={props.ariaLabel ?? ''}
      columns={resolveModeColumns(props.options.length)}
      options={props.options}
      value={props.value}
      onChange={props.onChange}
    />
  );
}
