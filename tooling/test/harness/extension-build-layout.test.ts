import { expect, it } from 'vitest';

import path from 'node:path';

import {
  createExtensionBuildLayout,
  extensionRollupInputs,
  isDeclaredExtensionBuildInput,
} from '../../../apps/extension/build/layout';
import { extensionHtmlInputSource } from '../../../apps/extension/build/extension-html-inputs';

const appRoot = path.resolve('apps/extension');
const layout = createExtensionBuildLayout(appRoot);

it('resolves one app root, repository output and exact external inputs', () => {
  expect(layout.appRoot).toBe(appRoot);
  expect(layout.outputRoot).toBe(path.resolve('dist'));
  expect(layout.externalInputRoots).toEqual(
    [
      'node_modules',
      'packages/foundation',
      'packages/platform',
      'packages/runtime-contracts',
      'packages/ui',
      'tooling/build/shims',
      'tooling/test/harness',
    ].map((entry) => path.resolve(entry))
  );
  expect(isDeclaredExtensionBuildInput(layout, path.resolve('tooling/qa/core/shared.mjs'))).toBe(
    false
  );
});

it('maps physical app and harness sources to stable legacy output ids', () => {
  const releaseInputs = extensionRollupInputs(layout, 'release');
  expect(releaseInputs.editor).toBe(path.join(appRoot, 'apps/extension/src/editor/index.html'));
  expect(releaseInputs.designSystem).toBeUndefined();

  const e2eInputs = extensionRollupInputs(layout, 'test-e2e');
  expect(e2eInputs.testHarnessPopup).toBe(path.join(appRoot, 'tooling/test/harness/popup.html'));
  expect(extensionHtmlInputSource(layout, e2eInputs.testHarnessPopup)).toBe(
    path.resolve('tooling/test/harness/popup.html')
  );
  expect(layout.manifestModuleInputs).toEqual([
    {
      sourceAbsolutePath: path.resolve('apps/extension/src/background/index.ts'),
      virtualAbsolutePath: path.join(appRoot, 'apps/extension/src/background/index.ts'),
    },
  ]);
});
