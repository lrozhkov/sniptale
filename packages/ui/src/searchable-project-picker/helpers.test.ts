import { describe, expect, it, vi } from 'vitest';

import {
  buildSearchableProjectPickerDataUi,
  buildSearchableProjectPickerRowRenderArgs,
  matchesQuery,
  normalizeQuery,
  resolveRecentProjects,
  withSearchableProjectPickerDataUiPrefix,
  withSearchableProjectPickerOptionalProps,
} from './helpers';

describe('searchable project picker query helpers', () => {
  it('normalizes queries and matches project names case-insensitively', () => {
    expect(normalizeQuery('  Release Notes  ')).toBe('release notes');
    expect(matchesQuery({ id: 'project-1', name: 'Release notes' }, 'release')).toBe(true);
    expect(matchesQuery({ id: 'project-1', name: 'Release notes' }, 'missing')).toBe(false);
    expect(matchesQuery({ id: 'project-1', name: 'Release notes' }, '')).toBe(true);
  });
});

describe('searchable project picker optional prop helpers', () => {
  it('builds omission-safe optional props and prefixed data-ui values', () => {
    const renderProjectRow = vi.fn();

    expect(withSearchableProjectPickerOptionalProps({})).toEqual({});
    expect(
      withSearchableProjectPickerOptionalProps({
        dataUiPrefix: 'picker',
        renderProjectRow,
      })
    ).toEqual({
      dataUiPrefix: 'picker',
      renderProjectRow,
    });
    expect(withSearchableProjectPickerDataUiPrefix(undefined)).toEqual({});
    expect(withSearchableProjectPickerDataUiPrefix('picker')).toEqual({
      dataUiPrefix: 'picker',
    });
    expect(buildSearchableProjectPickerDataUi(undefined, 'project')).toBeUndefined();
    expect(buildSearchableProjectPickerDataUi('picker', 'project')).toBe('picker.project');
  });
});

describe('searchable project picker row render helpers', () => {
  it('builds row-render args with optional prefixed project data-ui', () => {
    const onSelect = vi.fn();

    expect(
      buildSearchableProjectPickerRowRenderArgs({
        active: true,
        onSelect,
        project: { id: 'project-1', name: 'Project 1' },
      })
    ).toEqual({
      active: true,
      onSelect,
      project: { id: 'project-1', name: 'Project 1' },
    });

    expect(
      buildSearchableProjectPickerRowRenderArgs({
        active: false,
        dataUiPrefix: 'picker',
        onSelect,
        project: { id: 'project-2', name: 'Project 2' },
      })
    ).toEqual({
      active: false,
      dataUi: 'picker.project',
      onSelect,
      project: { id: 'project-2', name: 'Project 2' },
    });
  });
});

describe('searchable project picker recent projects', () => {
  it('resolves recent projects from tracked ids and falls back to the full project list', () => {
    const projects = [
      { id: 'project-1', name: 'Project 1' },
      { id: 'project-2', name: 'Project 2' },
    ];

    expect(
      resolveRecentProjects({
        hasTrackedRecentProjects: true,
        projects,
        recentProjectIds: ['project-2', 'missing', 'project-1'],
      })
    ).toEqual([projects[1], projects[0]]);
    expect(
      resolveRecentProjects({
        hasTrackedRecentProjects: false,
        projects,
      })
    ).toEqual(projects);
  });
});
