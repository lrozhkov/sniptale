import { Search } from 'lucide-react';
import { expect, it } from 'vitest';

import { translate } from '../../platform/i18n';
import {
  commandPaletteIcon,
  createCommandPaletteNavigationAction,
  createCommandPaletteRunAction,
  createCommandPaletteToggleAction,
  createCommandPaletteToolAction,
  createCommandPaletteUtilityAction,
  getCommandPaletteDisabledContextReason,
} from './action-builders';

it('builds run and utility actions with default and custom subtitles', () => {
  expect(
    createCommandPaletteRunAction({
      id: 'run',
      title: 'Run',
      section: 'Actions',
      onSelect: () => {},
    })
  ).toEqual(
    expect.objectContaining({
      subtitle: translate('shared.ui.commandPaletteRunActionHint'),
    })
  );

  expect(
    createCommandPaletteRunAction({
      id: 'run-custom',
      title: 'Run',
      subtitle: 'Custom',
      section: 'Actions',
      onSelect: () => {},
    })
  ).toEqual(
    expect.objectContaining({
      subtitle: 'Custom',
    })
  );

  expect(
    createCommandPaletteUtilityAction({
      id: 'utility',
      title: 'Utility',
      section: 'Utility',
      onSelect: () => {},
    })
  ).toEqual(
    expect.objectContaining({
      subtitle: translate('shared.ui.commandPaletteUtilityHint'),
    })
  );
});

it('builds navigation, toggle, and tool actions with active state subtitles', () => {
  expect(
    createCommandPaletteNavigationAction({
      id: 'nav',
      title: 'Home',
      section: 'Navigation',
      active: true,
      onSelect: () => {},
    })
  ).toEqual(
    expect.objectContaining({
      subtitle: translate('shared.ui.commandPaletteCurrentPageHint'),
    })
  );

  expect(
    createCommandPaletteToggleAction({
      id: 'toggle',
      title: 'Theme',
      section: 'Workspace',
      active: false,
      onSelect: () => {},
    })
  ).toEqual(
    expect.objectContaining({
      subtitle: translate('shared.ui.commandPaletteToggleHint'),
    })
  );

  expect(
    createCommandPaletteToolAction({
      id: 'tool',
      title: 'Brush',
      section: 'Tools',
      active: false,
      onSelect: () => {},
    })
  ).toEqual(
    expect.objectContaining({
      subtitle: translate('shared.ui.commandPaletteToolHint'),
    })
  );
});

it('creates command palette icons and exposes the shared disabled-context reason', () => {
  expect(commandPaletteIcon(Search)).toEqual(expect.objectContaining({ type: Search }));
  expect(getCommandPaletteDisabledContextReason()).toBe(
    translate('shared.ui.commandPaletteDisabledContextHint')
  );
});
