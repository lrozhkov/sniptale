import React from 'react';
import {
  CompactInput as SharedCompactInput,
  CompactRange as SharedCompactRange,
  CompactSelect as SharedCompactSelect,
  ColorField,
  FileActionRow,
  NumericRow,
  NumericValueField,
  OptionRow,
  PresetList,
  SearchField,
  SelectField,
  TextField,
  ToggleGrid,
  cx,
  type CompactSelectOption,
  type CompactSelectProps,
  type NumericRowProps,
  type NumericValueFieldProps,
  type PresetListGroup,
  type PresetListItem,
} from '../../../ui/compact-inspector-controls';
import { type ProductInputProps, type ProductRangeProps } from '@sniptale/ui/product-form-controls';

type LegacyCompactSelectProps<T extends string> = CompactSelectProps<T> & {
  menuClassName?: string;
};

export const CompactInput = React.forwardRef<HTMLInputElement, ProductInputProps>(
  function CompactInput({ className, ...props }, ref) {
    return <SharedCompactInput ref={ref} {...props} className={className} />;
  }
);

export const CompactRange = React.forwardRef<HTMLInputElement, ProductRangeProps>(
  function CompactRange({ className, ...props }, ref) {
    return <SharedCompactRange ref={ref} {...props} className={className} />;
  }
);

export function CompactSelect<T extends string>({
  menuClassName,
  ...props
}: LegacyCompactSelectProps<T>) {
  return (
    <SharedCompactSelect {...props} {...(menuClassName === undefined ? {} : { menuClassName })} />
  );
}

export {
  ColorField,
  FileActionRow,
  NumericRow,
  NumericValueField,
  OptionRow,
  PresetList,
  SearchField,
  SelectField,
  TextField,
  ToggleGrid,
  cx,
  type CompactSelectOption,
  type NumericRowProps,
  type NumericValueFieldProps,
  type PresetListGroup,
  type PresetListItem,
};
