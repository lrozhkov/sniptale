import { expect, it } from 'vitest';
import { createDefaultHighlighterSettings } from '../style/defaults';
import {
  createSessionVisibleBorderPresetIds,
  mergeSessionVisibleBorderPresetIds,
  selectSessionVisibleBorderPresets,
} from './session-visible';

it('starts with enabled presets and retains presets hidden during the open session', () => {
  const settings = createDefaultHighlighterSettings();
  const first = settings.borderPresets[0]!;
  const disabled = { ...first, id: 'disabled', enabled: false };
  const initial = { ...settings, borderPresets: [first, disabled] };
  const visible = createSessionVisibleBorderPresetIds(initial);
  expect(visible).toEqual([first.id]);

  const hiddenDuringSession = {
    ...initial,
    borderPresets: [{ ...first, enabled: false }, disabled],
  };
  const reconciled = mergeSessionVisibleBorderPresetIds(visible, hiddenDuringSession);
  expect(selectSessionVisibleBorderPresets(hiddenDuringSession, reconciled)).toEqual([
    hiddenDuringSession.borderPresets[0],
  ]);
});
