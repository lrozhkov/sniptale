import type { AnnotationTemplateSource } from '@sniptale/runtime-contracts/highlighter/border-preset';

export type TemplateSourceControl = {
  onChange: (source: AnnotationTemplateSource) => void;
  value: AnnotationTemplateSource;
};

export function createTemplateSourceAction(
  control: TemplateSourceControl,
  copy: {
    forcedDescription: string;
    forcedLabel: string;
    frameDescription: string;
    frameLabel: string;
  }
) {
  const forced = control.value === 'forced';
  return {
    description: forced ? copy.frameDescription : copy.forcedDescription,
    label: forced ? copy.frameLabel : copy.forcedLabel,
    onClick: () => control.onChange(forced ? 'frame-default' : 'forced'),
  };
}
