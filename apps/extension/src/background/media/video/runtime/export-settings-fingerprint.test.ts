import { expect, it } from 'vitest';
import type { VideoProjectExportSettings } from '../../../../features/video/project/types';
import { createProjectExportSettingsFingerprint } from './export-settings-fingerprint';

it('binds adaptive output mode to export authority and canonicalizes the legacy constant default', () => {
  const settings = { fps: 60, format: 'MP4' } as VideoProjectExportSettings;
  const legacy = createProjectExportSettingsFingerprint(settings);
  expect(createProjectExportSettingsFingerprint({ ...settings, frameRateMode: 'constant' })).toBe(
    legacy
  );
  expect(
    createProjectExportSettingsFingerprint({ ...settings, frameRateMode: 'adaptive' })
  ).not.toBe(legacy);
});
