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
    description: forced ? copy.forcedDescription : copy.frameDescription,
    label: forced ? copy.forcedLabel : copy.frameLabel,
    onClick: () => control.onChange(forced ? 'frame-default' : 'forced'),
  };
}
