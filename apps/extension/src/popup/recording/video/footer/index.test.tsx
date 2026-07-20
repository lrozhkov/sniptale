// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/navigation/extension-pages')>()),
  openGalleryPage: () => undefined,
  openVideoEditorPage: () => undefined,
}));

vi.mock('../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

import { VideoActiveFooterControls, VideoSetupFooter, VideoSetupWarnings } from './index';

describe('footer facade', () => {
  it('re-exports the footer owner modules', () => {
    expect(VideoActiveFooterControls).toBeTypeOf('function');
    expect(VideoSetupFooter).toBeTypeOf('function');
    expect(VideoSetupWarnings).toBeTypeOf('function');
  });
});
