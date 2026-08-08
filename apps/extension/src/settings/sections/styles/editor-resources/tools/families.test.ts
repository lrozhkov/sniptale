import { expect, it, vi } from 'vitest';
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
import { getToolPresetOwnerLabel, TOOL_PRESET_OWNERS } from './families';
it('owns editor tools without duplicating border presets', () => {
  expect(TOOL_PRESET_OWNERS).not.toContain('rectangle');
  expect(getToolPresetOwnerLabel('pencil')).toBe('editor.tools.pencil');
});
