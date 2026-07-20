import {
  Bold,
  Italic,
  Strikethrough,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Underline,
} from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { ColorField, ToggleGrid } from '../../../chrome/ui';
import { buildShapeColorControlProps } from '../brush-shape-sections/shared';
import { TextIconOptionButtons } from '../text-option-buttons';
import { CollapsibleSection, NumberField, RangeField, SelectField } from './fields';
import { VerticalTextAlignIcon } from './text-icons';
import type { RichShapeControlsProps } from './types';

type RichShapeTextPatch = NonNullable<
  Parameters<RichShapeControlsProps['applyRichShapePatch']>[0]['text']
>;

export function RichShapeTextSection(props: RichShapeControlsProps & { compact?: boolean }) {
  const body = <RichShapeTextBody {...props} />;

  if (props.compact) {
    return body;
  }

  return (
    <CollapsibleSection label={translate('editor.compact.richShapeText')}>
      {body}
    </CollapsibleSection>
  );
}

function RichShapeTextBody(props: RichShapeControlsProps) {
  const text = props.shape.text;
  const patchText = (patch: RichShapeTextPatch) => props.applyRichShapePatch({ text: patch });
  const colorLabel = translate('editor.compact.textColor');

  return (
    <div className="space-y-3">
      <SelectField
        label={translate('editor.compact.font')}
        value={fontToOption(text.fontFamily)}
        options={[
          { value: 'sans', label: translate('editor.compact.fontSans') },
          { value: 'serif', label: translate('editor.compact.fontSerif') },
          { value: 'mono', label: translate('editor.compact.fontMono') },
        ]}
        onChange={(fontFamily) => patchText({ fontFamily })}
      />
      <RangeField
        label={translate('editor.compact.fontSize')}
        value={text.fontSize}
        min={8}
        max={96}
        step={1}
        valueLabel={`${Math.round(text.fontSize)}px`}
        onChange={(fontSize) => patchText({ fontSize })}
      />
      <ColorField
        title={colorLabel}
        label={colorLabel}
        {...buildShapeColorControlProps(
          text.color,
          props.recentColors,
          (color) => props.updateColor((next: string) => patchText({ color: next }), color),
          (color) => props.updateColor((next: string) => patchText({ color: next }), color),
          props.textColorPalette
        )}
      />
      <RichShapeTextAlignButtons props={props} />
      <RichShapeTextVerticalAlignButtons props={props} />
      <RichShapeTextStyleButtons props={props} />
      <RichShapeTextInsetFields props={props} />
    </div>
  );
}

function RichShapeTextAlignButtons({ props }: { props: RichShapeControlsProps }) {
  const text = props.shape.text;
  const patchText = (patch: RichShapeTextPatch) => props.applyRichShapePatch({ text: patch });
  const value = text.horizontalAlign === 'justify' ? 'left' : text.horizontalAlign;
  const options = [
    {
      value: 'left' as const,
      label: translate('editor.compact.textAlignLeft'),
      icon: <TextAlignStart size={15} strokeWidth={2} />,
    },
    {
      value: 'center' as const,
      label: translate('editor.compact.textAlignCenter'),
      icon: <TextAlignCenter size={15} strokeWidth={2} />,
    },
    {
      value: 'right' as const,
      label: translate('editor.compact.textAlignRight'),
      icon: <TextAlignEnd size={15} strokeWidth={2} />,
    },
  ];
  return (
    <TextIconOptionButtons
      ariaLabel={translate('editor.compact.textAlign')}
      options={options}
      value={value}
      onSelect={(horizontalAlign) => patchText({ horizontalAlign })}
    />
  );
}

function RichShapeTextVerticalAlignButtons({ props }: { props: RichShapeControlsProps }) {
  const text = props.shape.text;
  const patchText = (patch: RichShapeTextPatch) => props.applyRichShapePatch({ text: patch });
  const options = [
    {
      value: 'top' as const,
      label: translate('editor.compact.verticalAlignTop'),
      icon: <VerticalTextAlignIcon position="top" />,
    },
    {
      value: 'middle' as const,
      label: translate('editor.compact.verticalAlignCenter'),
      icon: <VerticalTextAlignIcon position="middle" />,
    },
    {
      value: 'bottom' as const,
      label: translate('editor.compact.verticalAlignBottom'),
      icon: <VerticalTextAlignIcon position="bottom" />,
    },
  ];
  return (
    <TextIconOptionButtons
      ariaLabel={translate('editor.compact.verticalAlign')}
      options={options}
      value={text.verticalAlign}
      onSelect={(verticalAlign) => patchText({ verticalAlign })}
    />
  );
}

function fontToOption(fontFamily: string): 'sans' | 'serif' | 'mono' {
  if (fontFamily === 'serif' || fontFamily === 'mono') {
    return fontFamily;
  }
  return 'sans';
}

function RichShapeTextStyleButtons({ props }: { props: RichShapeControlsProps }) {
  const text = props.shape.text;
  const patchText = (patch: RichShapeTextPatch) => props.applyRichShapePatch({ text: patch });
  return (
    <ToggleGrid
      ariaLabel={translate('editor.compact.typography')}
      options={[
        {
          active: text.fontWeight === 'bold',
          label: translate('editor.compact.bold'),
          icon: <Bold size={15} strokeWidth={2.2} />,
          onToggle: () => patchText({ fontWeight: text.fontWeight === 'bold' ? 'normal' : 'bold' }),
        },
        {
          active: text.fontStyle === 'italic',
          label: translate('editor.compact.italic'),
          icon: <Italic size={15} strokeWidth={2.2} />,
          onToggle: () =>
            patchText({ fontStyle: text.fontStyle === 'italic' ? 'normal' : 'italic' }),
        },
        {
          active: text.underline,
          label: translate('editor.compact.underline'),
          icon: <Underline size={15} strokeWidth={2.2} />,
          onToggle: () => patchText({ underline: !text.underline }),
        },
        {
          active: text.strike,
          label: translate('editor.compact.strikethrough'),
          icon: <Strikethrough size={15} strokeWidth={2.2} />,
          onToggle: () => patchText({ strike: !text.strike }),
        },
      ]}
    />
  );
}

function RichShapeTextInsetFields({ props }: { props: RichShapeControlsProps }) {
  const patchInsets = (insets: Partial<typeof props.shape.text.insets>) =>
    props.applyRichShapePatch({ text: { insets } });
  const labels = {
    top: translate('editor.compact.richShapeInsetTopShort'),
    right: translate('editor.compact.richShapeInsetRightShort'),
    bottom: translate('editor.compact.richShapeInsetBottomShort'),
    left: translate('editor.compact.richShapeInsetLeftShort'),
  };
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-[color:var(--sniptale-color-text-muted-strong)]">
        {translate('editor.compact.richShapeTextInsets')}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <NumberField
            key={side}
            label={labels[side]}
            value={props.shape.text.insets[side]}
            min={0}
            onChange={(value) => patchInsets({ [side]: value })}
          />
        ))}
      </div>
    </div>
  );
}
