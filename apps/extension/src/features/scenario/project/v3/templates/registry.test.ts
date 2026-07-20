import { describe, expect, it } from 'vitest';

import { getBundledScenarioTemplate, listBundledScenarioTemplates } from './registry';
import { isScenarioTemplateDefinitionLike } from './validation';

describe('scenario v3 bundled template registry', () => {
  it('lists bundled templates in stable catalog order', () => {
    const templates = listBundledScenarioTemplates();

    expect(templates.map((template) => template.templateId)).toEqual([
      'screenshot-focus',
      'screenshot-callout',
      'step-guide',
      'blank',
      'title',
      'section-divider',
      'before-after',
      'code-focus',
      'summary',
    ]);
  });

  it('resolves bundled templates by id', () => {
    expect(getBundledScenarioTemplate('code-focus')?.slide.elements[0]?.role).toBe('title');
    expect(getBundledScenarioTemplate('screenshot-focus')?.slide.layout.layoutId).toBe(
      'screenshot-focus'
    );
    expect(getBundledScenarioTemplate('missing')).toBeNull();
  });

  it('keeps bundled templates inside import-grade validation limits', () => {
    expect(listBundledScenarioTemplates().every(isScenarioTemplateDefinitionLike)).toBe(true);
  });
});
