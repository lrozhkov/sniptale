import { expect, it } from 'vitest';

import { buildDocumentActionContentBuilders } from './commands';
import * as contentBuildersModule from './commands.content-builders/build';

it('keeps the content builders facade thin', () => {
  expect(buildDocumentActionContentBuilders).toBe(
    contentBuildersModule.buildDocumentActionContentBuilders
  );
});
