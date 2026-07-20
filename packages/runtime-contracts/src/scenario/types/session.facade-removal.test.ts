import { expectTypeOf, it } from 'vitest';

import type { ScenarioAssetMetadata } from './session';

it('keeps scenario session asset metadata available as a public project contract', () => {
  expectTypeOf<ScenarioAssetMetadata>().toEqualTypeOf<{
    height: number;
    mimeType: string;
    size: number;
    width: number;
  }>();
});
