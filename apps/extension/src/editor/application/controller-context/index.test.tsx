// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {
  cleanupDom,
  createControllerMock,
  renderWithController,
} from '../../../../../../tooling/test/harness/editor/ownership/shell-helpers';
import { useEditorController, useOptionalEditorController } from './';

it('shares the provided editor controller with required and optional consumers', () => {
  const controller = createControllerMock();
  const seen: {
    optional?: ReturnType<typeof useOptionalEditorController>;
    required?: ReturnType<typeof useEditorController>;
  } = {};

  function Probe() {
    seen.required = useEditorController();
    seen.optional = useOptionalEditorController();
    return null;
  }

  renderWithController(<Probe />, controller);

  expect(seen.required).toBe(controller);
  expect(seen.optional).toBe(controller);
  cleanupDom();
});
