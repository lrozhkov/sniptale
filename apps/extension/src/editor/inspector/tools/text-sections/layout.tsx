import { TextAlignCenter, TextAlignEnd, TextAlignStart } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { VerticalTextAlignIcon } from '../rich-shape/text-icons';
import { TextIconOptionButtons } from '../text-option-buttons';
import type { TextControlsProps, TextSettings } from './types';

export function renderTextAlignSection(props: TextControlsProps, settings: TextSettings) {
  const options = [
    {
      value: 'left' as const,
      label:
        props.textAlignOptions?.find((option) => option.value === 'left')?.label ??
        translate('editor.compact.textAlignLeft'),
      icon: <TextAlignStart size={15} strokeWidth={2} />,
    },
    {
      value: 'center' as const,
      label:
        props.textAlignOptions?.find((option) => option.value === 'center')?.label ??
        translate('editor.compact.textAlignCenter'),
      icon: <TextAlignCenter size={15} strokeWidth={2} />,
    },
    {
      value: 'right' as const,
      label:
        props.textAlignOptions?.find((option) => option.value === 'right')?.label ??
        translate('editor.compact.textAlignRight'),
      icon: <TextAlignEnd size={15} strokeWidth={2} />,
    },
  ];

  return (
    <TextIconOptionButtons
      ariaLabel={translate('editor.compact.textAlign')}
      columns={3}
      options={options}
      value={settings.textAlign}
      onSelect={(textAlign) => props.applyTextPatch({ textAlign })}
    />
  );
}

export function renderTextVerticalAlignSection(props: TextControlsProps, settings: TextSettings) {
  const options = [
    {
      value: 'top' as const,
      label:
        props.textVerticalAlignOptions?.find((option) => option.value === 'top')?.label ??
        translate('editor.compact.verticalAlignTop'),
      icon: <VerticalTextAlignIcon position="top" />,
    },
    {
      value: 'center' as const,
      label:
        props.textVerticalAlignOptions?.find((option) => option.value === 'center')?.label ??
        translate('editor.compact.verticalAlignCenter'),
      icon: <VerticalTextAlignIcon position="middle" />,
    },
    {
      value: 'bottom' as const,
      label:
        props.textVerticalAlignOptions?.find((option) => option.value === 'bottom')?.label ??
        translate('editor.compact.verticalAlignBottom'),
      icon: <VerticalTextAlignIcon position="bottom" />,
    },
  ];

  return (
    <TextIconOptionButtons
      ariaLabel={translate('editor.compact.verticalAlign')}
      columns={3}
      options={options}
      value={settings.verticalAlign}
      onSelect={(verticalAlign) => props.applyTextPatch({ verticalAlign })}
    />
  );
}
