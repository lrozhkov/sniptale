import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const aiModalOverridesOwnerStylesheet = readFileSync(
  new URL('./root.css', import.meta.url),
  'utf8'
);
const aiModalOverridesSurfaceStylesheet = readFileSync(
  new URL('./surface.css', import.meta.url),
  'utf8'
);
const aiModalOverridesActionsStylesheet = readFileSync(
  new URL('./actions.css', import.meta.url),
  'utf8'
);
const aiModalOverridesTemplatePickerStylesheet = readFileSync(
  new URL('./template-picker.css', import.meta.url),
  'utf8'
);
const aiModalOverridesTemplateEditorStylesheet = readFileSync(
  new URL('./template-editor.css', import.meta.url),
  'utf8'
);

function expectStylesheetToContain(stylesheet: string, selectors: string[]): void {
  selectors.forEach((selector) => {
    expect(stylesheet).toContain(selector);
  });
}

describe('overlays.ai-modal-overrides contract', () => {
  it('keeps the canonical ai-modal overrides owner as the import-only aggregator', () => {
    expect(aiModalOverridesOwnerStylesheet.trim()).toBe(
      [
        "@import './surface.css';",
        "@import './actions.css';",
        "@import './template-picker.css';",
        "@import './template-editor.css';",
      ].join('\n')
    );
  });

  it('keeps overlay surface chrome on the surface owner', () => {
    expectStylesheetToContain(aiModalOverridesSurfaceStylesheet, [
      '.sniptale-ai-modal-root .sniptale-label,',
      '.sniptale-ai-modal-root .sniptale-data-container {',
      '.sniptale-ai-modal-root .sniptale-soft-divider {',
    ]);
  });

  it('keeps overlay actions on the actions owner', () => {
    expectStylesheetToContain(aiModalOverridesActionsStylesheet, [
      '.sniptale-ai-modal-root .sniptale-ctrl-btn,',
      '.sniptale-ai-modal-root .sniptale-copy-btn:hover {',
      '.sniptale-ai-modal-root .sniptale-add-btn,',
    ]);
  });

  it('keeps template picker chrome and interactions on the template picker owner', () => {
    expectStylesheetToContain(aiModalOverridesTemplatePickerStylesheet, [
      '.sniptale-ai-modal-root .sniptale-template-container {',
      '.sniptale-ai-modal-root .sniptale-template-pill.drag-over {',
      '.sniptale-ai-modal-root .sniptale-template-dropdown {',
    ]);
  });

  it('keeps the template editor surface on the template editor owner', () => {
    expectStylesheetToContain(aiModalOverridesTemplateEditorStylesheet, [
      '.sniptale-ai-template-editor-backdrop {',
      '.sniptale-ai-template-editor-modal {',
      '.sniptale-ai-template-editor-modal .sniptale-textarea,',
    ]);
  });
});
