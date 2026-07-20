import { describe, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import { buildScenarioDeckExport } from './';

describe('buildScenarioDeckExport', () => {
  it('routes HTML and Markdown formats through the shared deck facade', async () => {
    const getAssetBlob = vi.fn(async () => undefined);
    const project = createScenarioProjectV3('Facade deck');
    const html = await buildScenarioDeckExport({
      getAssetBlob,
      options: createOptions('html'),
      project,
    });
    const markdown = await buildScenarioDeckExport({
      getAssetBlob,
      options: createOptions('markdown'),
      project,
    });

    expect(html.filename).toBe('facade-deck.html');
    expect(markdown.filename).toBe('facade-deck-markdown.zip');
  });
});

function createOptions(format: 'html' | 'markdown') {
  return {
    assetMode: 'embed',
    format,
    includeMissingPlaceholders: true,
    includeNotes: true,
    includeSourceJson: false,
  } as const;
}
