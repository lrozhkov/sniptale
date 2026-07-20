// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRecentCommandPaletteActionIds,
  buildCommandPaletteGroups,
  filterCommandPaletteActions,
} from './helpers';
import type { CommandPaletteAction } from './types';

const ACTIONS: CommandPaletteAction[] = [
  {
    id: 'open-settings',
    title: 'Open settings',
    keywords: ['preferences', 'configuration'],
    onSelect: () => undefined,
  },
  {
    id: 'open-gallery',
    title: 'Open gallery',
    keywords: ['images', 'media'],
    onSelect: () => undefined,
  },
  {
    id: 'start-recording',
    title: 'Start recording',
    keywords: ['video', 'capture'],
    onSelect: () => undefined,
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('filterCommandPaletteActions', () => {
  it('returns a shallow copy when the query is blank', () => {
    const results = filterCommandPaletteActions(ACTIONS, '   ');

    expect(results).toEqual(ACTIONS);
    expect(results).not.toBe(ACTIONS);
  });

  it('prioritizes title-prefix matches over broad keyword matches', () => {
    const results = filterCommandPaletteActions(ACTIONS, 'open');

    expect(results.map((action) => action.id)).toEqual(['open-gallery', 'open-settings']);
  });

  it('matches fuzzy subsequences for compact command queries', () => {
    const results = filterCommandPaletteActions(ACTIONS, 'sr');

    expect(results.map((action) => action.id)).toContain('start-recording');
  });

  it('falls back to alphabetical order when scores are equal', () => {
    const tiedActions: CommandPaletteAction[] = [
      {
        id: 'beta',
        title: 'Beta',
        onSelect: () => undefined,
      },
      {
        id: 'alpha',
        title: 'Alpha',
        onSelect: () => undefined,
      },
    ];

    const results = filterCommandPaletteActions(tiedActions, '');

    expect(results.map((action) => action.id)).toEqual(['beta', 'alpha']);
  });
});

describe('buildCommandPaletteGroups', () => {
  it('returns only the search results group when a query is present', () => {
    const groups = buildCommandPaletteGroups(ACTIONS, ['open-gallery'], 'open');

    expect(groups).toEqual([
      {
        id: 'results',
        label: 'shared.ui.commandPaletteResultsSection',
        actions: [ACTIONS[1], ACTIONS[0]],
      },
    ]);
  });

  it('returns a single all-actions group when there are no matching recents', () => {
    const groups = buildCommandPaletteGroups(ACTIONS, ['missing'], '');

    expect(groups).toEqual([
      {
        id: 'all',
        label: 'shared.ui.commandPaletteAllSection',
        actions: ACTIONS,
      },
    ]);
  });

  it('builds recent and remaining groups when stored recents exist', () => {
    const groups = buildCommandPaletteGroups(
      ACTIONS,
      ['open-gallery', 'missing', 'open-settings'],
      ''
    );

    expect(groups).toEqual([
      {
        id: 'recent',
        label: 'shared.ui.commandPaletteRecentSection',
        actions: [ACTIONS[1], ACTIONS[0]],
      },
      {
        id: 'all',
        label: 'shared.ui.commandPaletteAllSection',
        actions: [ACTIONS[2]],
      },
    ]);
  });
});

describe('buildRecentCommandPaletteActionIds', () => {
  it('prepends the selected action, deduplicates it and trims old entries', () => {
    expect(
      buildRecentCommandPaletteActionIds(
        ['open-settings', 'open-gallery', 'start-recording', 'one', 'two'],
        'open-gallery'
      )
    ).toEqual(['open-gallery', 'open-settings', 'start-recording', 'one', 'two']);
  });

  it('returns a new single-item list when the selection starts empty', () => {
    expect(buildRecentCommandPaletteActionIds([], 'open-settings')).toEqual(['open-settings']);
  });
});
