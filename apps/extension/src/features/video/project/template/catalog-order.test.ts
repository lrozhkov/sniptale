import { expect, it } from 'vitest';

import { VideoTemplateCatalogStatus } from './catalog-status';
import { buildTemplateGroups, buildTemplateSelectionOrder } from './catalog-order';

const definitions = [
  {
    catalogRank: 2,
    catalogStatus: VideoTemplateCatalogStatus.OPTIONAL,
    groupLabelKey: 'secondary',
    templateKind: 'optional-secondary',
  },
  {
    catalogRank: 3,
    catalogStatus: VideoTemplateCatalogStatus.LEGACY,
    groupLabelKey: 'primary',
    templateKind: 'legacy-primary',
  },
  {
    catalogRank: 1,
    catalogStatus: VideoTemplateCatalogStatus.CORE,
    groupLabelKey: 'primary',
    templateKind: 'core-primary',
  },
] as const;

it('orders template definitions by group, status, and rank', () => {
  expect(buildTemplateSelectionOrder(definitions, ['primary', 'secondary'])).toEqual([
    'core-primary',
    'legacy-primary',
    'optional-secondary',
  ]);
});

it('builds filtered template groups without empty groups', () => {
  expect(
    buildTemplateGroups(
      definitions,
      ['primary', 'secondary'],
      (definition) => definition.templateKind !== 'legacy-primary'
    )
  ).toEqual([
    { groupLabelKey: 'primary', templateKinds: ['core-primary'] },
    { groupLabelKey: 'secondary', templateKinds: ['optional-secondary'] },
  ]);
});
