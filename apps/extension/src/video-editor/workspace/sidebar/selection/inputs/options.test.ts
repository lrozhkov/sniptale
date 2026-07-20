import { describe, expect, it, vi } from 'vitest';
import type { GlassSelectOption } from '../../../../../ui/glass-select';
import {
  buildTemplateCatalogOptions,
  buildVocabularySelectOptions,
  getSelectedOptionLabel,
} from './options';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

describe('selection options helpers', () => {
  it('builds translated vocabulary options from shared definitions', () => {
    expect(
      buildVocabularySelectOptions([
        { value: 'LEFT', labelKey: 'videoEditor.sidebar.annotationDirectionLeft' },
        { value: 'RIGHT', labelKey: 'videoEditor.sidebar.annotationDirectionRight' },
      ] as const)
    ).toEqual([
      { value: 'LEFT', label: 'videoEditor.sidebar.annotationDirectionLeft' },
      { value: 'RIGHT', label: 'videoEditor.sidebar.annotationDirectionRight' },
    ]);
  });

  it('builds grouped template options from catalog definitions', () => {
    expect(
      buildTemplateCatalogOptions(['POINTER_LABEL'] as const, (value) => ({
        descriptionKey: 'videoEditor.templates.overlayDescriptionPointerLabel',
        groupLabelKey: 'videoEditor.templates.overlayGroupCallouts',
        labelKey: 'videoEditor.sidebar.annotationTemplatePointerLabel',
        templateKind: value,
      }))
    ).toEqual([
      {
        description: 'videoEditor.templates.overlayDescriptionPointerLabel',
        groupLabel: 'videoEditor.templates.overlayGroupCallouts',
        label: 'videoEditor.sidebar.annotationTemplatePointerLabel',
        value: 'POINTER_LABEL',
      },
    ]);
  });

  it('resolves selected option labels and falls back to the raw value', () => {
    const options = [
      { value: 'LEFT', label: 'Left' },
    ] as const satisfies readonly GlassSelectOption<'LEFT' | 'RIGHT'>[];

    expect(getSelectedOptionLabel(options, 'LEFT')).toBe('Left');
    expect(getSelectedOptionLabel(options, 'RIGHT')).toBe('RIGHT');
  });
});
