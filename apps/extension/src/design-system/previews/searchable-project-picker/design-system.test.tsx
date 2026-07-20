// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pickerSpy: vi.fn(),
}));

vi.mock('@sniptale/ui/searchable-project-picker', () => ({
  SearchableProjectPicker: (props: {
    activeProjectId: string | null;
    onCreateProject: () => void;
    onSelectProject: (projectId: string) => void;
    projects: Array<{ id: string; name: string }>;
    emptyLabel: string;
    noResultsLabel: string;
  }) => {
    mocks.pickerSpy(props);

    return (
      <div
        data-testid={props.activeProjectId ?? 'empty-picker'}
        data-project-count={String(props.projects.length)}
      >
        {props.emptyLabel}
        {props.noResultsLabel}
      </div>
    );
  },
}));

import { buildSearchableProjectPickerPreviews } from './design-system';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.pickerSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('buildSearchableProjectPickerPreviews', () => {
  it('builds localized preview variants from the shared picker surface', () => {
    const previews = buildSearchableProjectPickerPreviews('en');

    expect(previews.map((preview) => preview.previewId)).toEqual([
      'shared.ui.searchable-project-picker.default',
      'shared.ui.searchable-project-picker.empty',
    ]);

    renderNode(
      <>
        {previews[0]?.preview}
        {previews[1]?.preview}
      </>
    );

    const defaultProps = mocks.pickerSpy.mock.calls[0]?.[0] as {
      activeProjectId: string | null;
      onCreateProject: () => void;
      onSelectProject: (projectId: string) => void;
      projects: Array<{ id: string; name: string }>;
    };
    const emptyProps = mocks.pickerSpy.mock.calls[1]?.[0] as typeof defaultProps;

    expect(defaultProps.activeProjectId).toBe('release-checklist');
    expect(defaultProps.projects.map((project) => project.id)).toEqual([
      'scenario-onboarding',
      'release-checklist',
      'support-escalation',
    ]);

    act(() => {
      defaultProps.onCreateProject();
      defaultProps.onSelectProject('release-checklist');
      emptyProps.onCreateProject();
      emptyProps.onSelectProject('empty-picker');
    });

    expect(emptyProps.activeProjectId).toBeNull();
    expect(emptyProps.projects).toEqual([]);
    expect(
      container
        ?.querySelector('[data-testid="release-checklist"]')
        ?.getAttribute('data-project-count')
    ).toBe('3');
    expect(
      container?.querySelector('[data-testid="empty-picker"]')?.getAttribute('data-project-count')
    ).toBe('0');
  });
});
