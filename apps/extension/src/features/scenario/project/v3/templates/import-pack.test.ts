import { expect, it } from 'vitest';

import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioTextElement } from '../factories';
import { SCENARIO_V3_LIMITS } from '../limits';
import { validateScenarioTemplatePack } from './import-pack';

interface TemplatePackFixture {
  library: {
    name: string;
  };
  templates: ScenarioTemplateDefinition[];
  version: 1;
}

function createValidTemplatePack(): TemplatePackFixture {
  return {
    version: 1,
    library: {
      name: 'Team templates',
    },
    templates: [
      {
        catalogRank: 0,
        catalogStatus: 'core',
        description: 'A team title slide',
        group: 'team',
        label: 'Team title',
        slide: {
          canvas: {
            background: { color: '#fff8ed', kind: 'solid' },
            height: 720,
            width: 1280,
          },
          elements: [createScenarioTextElement({ role: 'title', text: 'Title' })],
          layout: {
            compositionPreset: 'cover',
            layoutId: 'title',
            safeArea: { bottom: 56, left: 64, right: 64, top: 56 },
            themeOverrides: null,
          },
          notes: '',
          title: 'Team title',
        },
        source: 'imported',
        templateId: 'team-title',
        version: 1,
      },
    ],
  };
}

function getFirstTemplate(pack: TemplatePackFixture): ScenarioTemplateDefinition {
  return pack.templates[0]!;
}

function createBoundaryTemplatePack(template: unknown): unknown {
  const pack = createValidTemplatePack();
  return {
    ...pack,
    templates: [template],
  };
}

it('accepts valid imported template packs', () => {
  const result = validateScenarioTemplatePack(createValidTemplatePack());

  expect(result.libraryName).toBe('Team templates');
  expect(result.acceptedTemplates).toHaveLength(1);
  expect(result.rejectedTemplates).toEqual([]);
});

it('accepts imported template packs with representable layout metadata', () => {
  const pack = createValidTemplatePack();
  const template = getFirstTemplate(pack);
  pack.templates[0] = {
    ...template,
    slide: {
      ...template.slide,
      layout: {
        compositionPreset: 'divider',
        layoutId: 'section-divider',
        safeArea: { bottom: 56, left: 64, right: 64, top: 56 },
        themeOverrides: { accentColor: '#f97316' },
      },
    },
  };

  const result = validateScenarioTemplatePack(pack);

  expect(result.acceptedTemplates).toHaveLength(1);
  expect(result.rejectedTemplates).toEqual([]);
});

it('rejects invalid roots and unsafe template fields', () => {
  const invalidRoot = validateScenarioTemplatePack({ version: 2 });
  const template = getFirstTemplate(createValidTemplatePack());
  const unsafePack = createBoundaryTemplatePack({
    ...template,
    html: '<script>alert(1)</script>',
  });

  expect(invalidRoot.rejectedTemplates[0]?.reason).toBe('invalid-root');
  expect(validateScenarioTemplatePack(unsafePack).rejectedTemplates[0]?.reason).toBe(
    'unsafe-template-fields'
  );
});

it('rejects templates with unsupported presentation fields', () => {
  const template = getFirstTemplate(createValidTemplatePack());
  const unsupportedPack = createBoundaryTemplatePack({
    ...template,
    slide: {
      ...template.slide,
      customCss: '.deck { color: red; }',
    },
  });

  expect(validateScenarioTemplatePack(unsupportedPack).rejectedTemplates[0]?.reason).toBe(
    'invalid-template-shape'
  );
});

it('caps imported template pack sizes before accepting templates', () => {
  const oversizedPack = createValidTemplatePack();
  oversizedPack.templates = Array.from(
    { length: SCENARIO_V3_LIMITS.maxImportedTemplates + 1 },
    (_, index) => ({
      ...createValidTemplatePack().templates[0]!,
      templateId: `team-title-${index}`,
    })
  );

  const result = validateScenarioTemplatePack(oversizedPack);

  expect(result.acceptedTemplates).toHaveLength(SCENARIO_V3_LIMITS.maxImportedTemplates);
  expect(result.rejectedTemplates[0]).toEqual({
    path: 'templates',
    reason: 'too-many-templates',
    templateId: null,
  });
});

it('rejects templates with malformed kind-specific element fields', () => {
  const template = getFirstTemplate(createValidTemplatePack());
  const unsupportedPack = createBoundaryTemplatePack({
    ...template,
    slide: {
      ...template.slide,
      elements: [
        {
          ...createScenarioTextElement({ role: 'title', text: 'Title' }),
          style: { align: 'middle', color: '#111', fontSize: 44, fontWeight: 700 },
        },
      ],
    },
  });

  expect(validateScenarioTemplatePack(unsupportedPack).rejectedTemplates[0]?.reason).toBe(
    'invalid-template-shape'
  );
});

it('rejects templates with unsafe color paint tokens', () => {
  const template = getFirstTemplate(createValidTemplatePack());
  const unsupportedPack = createBoundaryTemplatePack({
    ...template,
    slide: {
      ...template.slide,
      canvas: {
        ...template.slide.canvas,
        background: { color: 'url(https://tracker.test/paint.svg#x)', kind: 'solid' },
      },
      elements: [
        createScenarioTextElement({
          role: 'title',
          style: {
            align: 'left',
            color: 'u\\72l(https://tracker.test/paint.svg#x)',
            fontSize: 44,
            fontWeight: 700,
          },
          text: 'Title',
        }),
      ],
    },
  });

  expect(validateScenarioTemplatePack(unsupportedPack).rejectedTemplates[0]?.reason).toBe(
    'invalid-template-shape'
  );
});

it('rejects templates with extreme finite values and oversized strings', () => {
  const template = getFirstTemplate(createValidTemplatePack());
  const unsupportedPack = createBoundaryTemplatePack({
    ...template,
    slide: {
      ...template.slide,
      canvas: {
        background: { color: '#fff', kind: 'solid' },
        height: 720,
        width: SCENARIO_V3_LIMITS.maxCanvasDimension + 1,
      },
      title: 'x'.repeat(SCENARIO_V3_LIMITS.maxLabelLength + 1),
    },
  });

  expect(validateScenarioTemplatePack(unsupportedPack).rejectedTemplates[0]?.reason).toBe(
    'invalid-template-shape'
  );
});

it('rejects templates with unrepresentable layout metadata', () => {
  const template = getFirstTemplate(createValidTemplatePack());
  const unsupportedPack = createBoundaryTemplatePack({
    ...template,
    slide: {
      ...template.slide,
      layout: {
        compositionPreset: 'plugin-grid',
        layoutId: 'custom-plugin-layout',
        safeArea: { bottom: 56, left: 64, right: 64, top: 56 },
        themeOverrides: null,
      },
    },
  });

  expect(validateScenarioTemplatePack(unsupportedPack).rejectedTemplates[0]?.reason).toBe(
    'invalid-template-shape'
  );
});

it('rejects duplicate and bundled template ids', () => {
  const duplicatePack = createValidTemplatePack();
  duplicatePack.templates.push({ ...getFirstTemplate(duplicatePack) });
  const bundledCollisionPack = createValidTemplatePack();
  const template = getFirstTemplate(bundledCollisionPack);
  bundledCollisionPack.templates[0] = {
    ...template,
    templateId: 'blank',
  };

  expect(validateScenarioTemplatePack(duplicatePack).rejectedTemplates[0]?.reason).toBe(
    'invalid-or-duplicate-template-id'
  );
  expect(validateScenarioTemplatePack(bundledCollisionPack).rejectedTemplates[0]?.reason).toBe(
    'invalid-or-duplicate-template-id'
  );
});
