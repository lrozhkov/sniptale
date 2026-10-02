// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createScenarioExportItem, createScenarioItem } from '../actions/test-support';
import { PreviewActions, PreviewMetadataCards } from './sidebar-sections';
import { PreviewScenarioStage } from './scenario-stage';
import { PreviewSourceField } from './source-field';
import type { PreviewPanelProps } from './types';

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  steps: vi.fn(),
  openEditor: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));
vi.mock('../../../composition/persistence/scenario/projects/viewing', () => ({
  readScenarioViewingSnapshot: mocks.snapshot,
}));
vi.mock(
  '../../../composition/persistence/scenario/store/project-steps/project-step-queries',
  () => ({
    listScenarioPreviewSteps: mocks.steps,
  })
);
vi.mock('../../../platform/navigation/extension-pages', async (original) => ({
  ...(await original<typeof import('../../../platform/navigation/extension-pages')>()),
  openScenarioEditorPage: mocks.openEditor,
}));
vi.mock('../../../platform/navigation/extension-pages/scenario-editor', () => ({
  buildScenarioEditorUrl: ({
    projectId,
    view,
    exportId,
  }: {
    projectId?: string;
    view?: string;
    exportId?: string;
  }) =>
    `https://extension.test/?${exportId ? `exportId=${exportId}` : `projectId=${projectId}`}${view ? `&view=${view}` : ''}`,
}));

const hosts: Array<{ root: ReturnType<typeof createRoot>; node: HTMLDivElement }> = [];

async function render(node: ReactNode) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  hosts.push({ root, node: host });
  await act(async () => root.render(node));
  return { host, root };
}

function props(item: PreviewPanelProps['item']): PreviewPanelProps {
  return {
    item,
    filenameDraft: item.filename,
    inspectorCollapsed: false,
    onAddTag: vi.fn(),
    onClose: vi.fn(),
    onCopy: vi.fn(),
    onDelete: vi.fn(),
    onDownload: vi.fn(),
    onEdit: vi.fn(),
    onFilenameChange: vi.fn(),
    onInspectorToggle: vi.fn(),
    onRemoveTag: vi.fn(),
    onTagDraftChange: vi.fn(),
    previewUrl: null,
    tagDraft: '',
    tagDrafts: [],
  };
}

afterEach(() => {
  for (const { root, node } of hosts.splice(0)) {
    act(() => root.unmount());
    node.remove();
  }
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('keeps guide and tour actions in the inspected project Actions section, away from steps', async () => {
  mocks.snapshot.mockResolvedValue({ project: { tour: {} } });
  mocks.steps.mockResolvedValue([]);
  const item = createScenarioItem();
  const { host } = await render(
    <>
      <main>
        <PreviewScenarioStage item={item} />
      </main>
      <aside>
        <PreviewActions {...props(item)} />
      </aside>
    </>
  );
  expect(host.querySelector('main a')).toBeNull();
  expect(host.querySelector('aside .lucide-book-open')).not.toBeNull();
  expect(host.querySelector('aside .lucide-mouse-pointer-click')).not.toBeNull();
  const actions = host.querySelector('aside section');
  expect(actions?.querySelectorAll('a[href*="view="]')).toHaveLength(2);
  expect(actions?.textContent).toContain('gallery.preview.actions');
  expect(actions?.querySelector('a[href*="view=tour"]')).not.toBeNull();
});

it('distinguishes historical export metadata from the current project and links only when available', async () => {
  mocks.snapshot.mockResolvedValue({ project: {} });
  mocks.steps.mockResolvedValue([]);
  const item = createScenarioExportItem({ filename: 'old-guide.html' });
  const { host, root } = await render(
    <>
      <main>
        <PreviewScenarioStage item={item} />
      </main>
      <aside>
        <PreviewSourceField item={item} />
        <PreviewActions {...props(item)} />
      </aside>
    </>
  );
  expect(host.querySelector('main')?.textContent).toContain(
    'gallery.preview.exportCurrentProjectSteps'
  );
  expect(host.querySelector('aside')?.textContent).toContain('gallery.preview.exportSourceProject');
  const open = host.querySelector<HTMLAnchorElement>('aside a[href*="projectId="]');
  expect(open?.href).toContain(`projectId=${item.project.id}`);
  expect(open?.href).not.toContain('view=');
  const unavailable = {
    ...item,
    project: { ...item.project, availability: 'invalid' as const },
  } as const;
  await act(async () =>
    root.render(
      <aside>
        <PreviewSourceField item={unavailable} />
        <PreviewActions {...props(unavailable)} />
      </aside>
    )
  );
  expect(host.textContent).toContain('gallery.preview.exportSourceUnavailable');
  expect(host.querySelector('a[href*="projectId="]')).toBeNull();
});

it('removes repeated ready-to-edit copy while retaining scenario availability recovery', async () => {
  const { host, root } = await render(<PreviewMetadataCards item={createScenarioItem()} />);
  expect(host.textContent).not.toContain('gallery.preview.editableProject');
  expect(host.textContent).toContain('gallery.preview.type');
  const item = createScenarioItem();
  await act(async () =>
    root.render(
      <PreviewMetadataCards
        item={{ ...item, project: { ...item.project, availability: 'invalid' as const } }}
      />
    )
  );
  expect(host.textContent).toContain('gallery.preview.projectUnavailable');
});

it.each(['saved-guide.html', 'saved-tour.html'])(
  'exposes selected HTML file actions for %s separately from the current project',
  async (filename) => {
    mocks.snapshot.mockResolvedValue({ project: { name: 'Changed after export' } });
    const item = createScenarioExportItem({ filename, format: 'html' });
    const { host } = await render(<PreviewActions {...props(item)} />);
    expect(host.querySelector('button[aria-label="gallery.preview.download"]')).not.toBeNull();
    expect(host.textContent).toContain('View saved HTML');
    expect(host.textContent).toContain('Open current project');
  }
);

it.each(['guide', 'tour'] as const)(
  'links only the selected saved %s identity even when current project is invalid',
  async (mode) => {
    const base = createScenarioExportItem();
    const item = createScenarioExportItem({
      exportEntry: { ...base.exportEntry, html: { mode, assetId: 'saved-body' } },
      project: { ...base.project, availability: 'invalid' },
    });
    const { host } = await render(<PreviewActions {...props(item)} />);
    const link = host.querySelector<HTMLAnchorElement>('a[href*="exportId="]');
    expect(link?.href).toContain(`exportId=${item.entityId}`);
    expect(link?.href).toContain('view=export');
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="gallery.preview.download"]')
        ?.disabled
    ).toBe(false);
    expect(host.querySelector('a[href*="projectId="]')).toBeNull();
  }
);
