import { expect, it } from 'vitest';
import { getFilteredAIProviders } from './helpers';
it('finds an exact Model ID independently of display name, ignoring case', () => {
  const model = {
    id: 'model',
    providerId: 'provider',
    displayName: 'Friendly name',
    modelCode: 'Vendor/Exact-Model-42',
  };
  expect(
    getFilteredAIProviders([{ id: 'provider', name: 'Provider' }], [model], 'exact-model')
  ).toEqual([{ provider: { id: 'provider', name: 'Provider' }, models: [model] }]);
  expect(
    getFilteredAIProviders([{ id: 'provider', name: 'Provider' }], [model], 'missing')
  ).toEqual([]);
});

it.each(['friendly', 'provider', ''])(
  'preserves catalog search by display or connection name for %j',
  (query) => {
    const model = {
      id: 'model',
      providerId: 'provider',
      displayName: 'Friendly name',
      modelCode: 'vendor/exact-code',
    };
    const foreign = { ...model, id: 'foreign', providerId: 'not-configured' };
    expect(
      getFilteredAIProviders([{ id: 'provider', name: 'Provider' }], [model, foreign], query)
    ).toEqual([{ provider: { id: 'provider', name: 'Provider' }, models: [model] }]);
  }
);
