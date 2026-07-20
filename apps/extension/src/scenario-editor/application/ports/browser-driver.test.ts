import { describe, expectTypeOf, it } from 'vitest';
import type { ScenarioEditorBrowserDriverPort } from './browser-driver';

describe('scenario editor browser driver port', () => {
  it('keeps project-facing browser effects behind a narrow port', () => {
    expectTypeOf<ScenarioEditorBrowserDriverPort>().toEqualTypeOf<{
      downloadBlob: (blob: Blob, filename: string) => void;
      replaceSelectionInUrl: (args: { projectId: string | null; stepId?: string | null }) => void;
    }>();
  });
});
