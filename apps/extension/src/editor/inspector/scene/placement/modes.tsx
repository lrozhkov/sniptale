import React from 'react';
import { ProductGlassChip, ProductGlassOptionGrid } from '@sniptale/ui/product-glass-controls';

import type { CompactSelectOption } from '../../../chrome/ui';

export function EditorInspectorFrameModeButtons<T extends string>(props: {
  ariaLabel?: string;
  options: CompactSelectOption<T>[];
  value: T;
  onChange: (next: T) => void;
}): React.ReactElement {
  return (
    <ProductGlassOptionGrid aria-label={props.ariaLabel} role="group">
      {props.options.map((option) => (
        <ProductGlassChip
          active={option.value === props.value}
          aria-pressed={option.value === props.value}
          key={option.value}
          onClick={() => props.onChange(option.value)}
          type="button"
        >
          {option.label}
        </ProductGlassChip>
      ))}
    </ProductGlassOptionGrid>
  );
}
