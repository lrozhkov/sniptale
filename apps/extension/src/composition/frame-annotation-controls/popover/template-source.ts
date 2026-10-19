import type { AnnotationTemplateSource } from '@sniptale/runtime-contracts/highlighter/border-preset';

export type TemplateSourceControl = {
  onChange: (source: AnnotationTemplateSource) => void;
  value: AnnotationTemplateSource;
};

export function createTemplateSourceHeaderControl(
  control: TemplateSourceControl,
  copy: {
    forcedDescription: string;
    forcedLabel: string;
    frameDescription: string;
    frameLabel: string;
  }
) {
  return {
    ...control,
    options: [
      {
        value: 'frame-default' as const,
        label: copy.frameLabel,
        description: copy.frameDescription,
      },
      { value: 'forced' as const, label: copy.forcedLabel, description: copy.forcedDescription },
    ],
  };
}

export type TemplateSourceHeaderControl = ReturnType<typeof createTemplateSourceHeaderControl>;
