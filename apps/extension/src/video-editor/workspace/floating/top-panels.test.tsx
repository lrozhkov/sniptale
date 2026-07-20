// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../platform/i18n';
import { PROJECT_MEDIA_ACCEPT_ATTRIBUTE } from '../../project/operations/import-validation';
import { createFloatingWorkspaceController } from './top-panels.test-support';
import { VideoEditorFloatingInsertPanel, VideoEditorFloatingWorkspacePanel } from './top-panels';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('activates canvas-point insert tools instead of immediately inserting text and shapes', () => {
  const controller = createFloatingWorkspaceController();
  const onActiveInsertKindChange = vi.fn();
  render(
    <>
      <VideoEditorFloatingInsertPanel
        activeInsertKind={null}
        controller={controller}
        effectsLibraryDock={createEffectsLibraryDock()}
        onActiveInsertKindChange={onActiveInsertKindChange}
      />
      <VideoEditorFloatingWorkspacePanel controller={controller} />
    </>
  );

  clickByLabel(translate('videoEditor.stage.addText'));
  clickByLabel(translate('videoEditor.stage.addRectangle'));
  clickByLabel(translate('videoEditor.stage.addLine'));
  clickByLabel(translate('videoEditor.stage.addArrow'));
  clickByLabel(translate('videoEditor.app.selectMoveButton'));

  expect(onActiveInsertKindChange).toHaveBeenNthCalledWith(1, 'text');
  expect(onActiveInsertKindChange).toHaveBeenNthCalledWith(2, 'shape');
  expect(onActiveInsertKindChange).toHaveBeenNthCalledWith(3, 'line');
  expect(onActiveInsertKindChange).toHaveBeenNthCalledWith(4, 'arrow');
  expect(onActiveInsertKindChange).toHaveBeenNthCalledWith(5, null);
  expect(controller.timeline.actions.insertion.onAddTextOverlay).not.toHaveBeenCalled();
  expect(controller.timeline.actions.insertion.onAddShapeOverlay).not.toHaveBeenCalled();
  expect(queryUi('video-editor.floating.tool-rail')).toBeNull();
});

it('routes media, templates, and workspace panel actions without a left rail', () => {
  const controller = createFloatingWorkspaceController();
  const effectsLibraryDock = createEffectsLibraryDock();
  render(
    <>
      <VideoEditorFloatingInsertPanel
        activeInsertKind={null}
        controller={controller}
        effectsLibraryDock={effectsLibraryDock}
        onActiveInsertKindChange={vi.fn()}
      />
      <VideoEditorFloatingWorkspacePanel controller={controller} />
    </>
  );

  importMediaFile('image.png', 'image/png');
  importMediaFile('video.mp4', 'video/mp4');
  importMediaFile('audio.wav', 'audio/wav');
  clickByUi('video-editor.floating.insert-panel.templates');
  clickByUi('video-editor.floating.workspace-panel.scene');
  clickByUi('video-editor.floating.workspace-panel.grid');
  clickByUi('video-editor.floating.workspace-panel.magnet');
  clickByUi('video-editor.floating.workspace-panel.record-audio');

  expect(controller.timeline.actions.insertion.onImport.image).toHaveBeenCalled();
  expect(controller.timeline.actions.insertion.onImport.video).toHaveBeenCalled();
  expect(controller.timeline.actions.insertion.onImport.audio).toHaveBeenCalled();
  expect(effectsLibraryDock.onToggle).toHaveBeenCalled();
  expect(queryUi('video-editor.floating.workspace-panel.inspector')).toBeNull();
  expect(queryUi('video-editor.floating.workspace-panel.workspace')).toBeNull();
  expect(queryUi('video-editor.floating.workspace-panel.effects-library')).toBeNull();
  expect(controller.header.onToggleSidebar).not.toHaveBeenCalled();
  expect(controller.header.onSelectScene).toHaveBeenCalled();
  expect(controller.header.onOpenGridSettings).toHaveBeenCalled();
  expect(controller.header.grid.onToggleMagnet).toHaveBeenCalled();
  expect(controller.header.onOpenAudioRecordingDialog).toHaveBeenCalled();
});

it('keeps templates as a single creation action in the top panels', () => {
  const controller = createFloatingWorkspaceController();
  const effectsLibraryDock = createEffectsLibraryDock();
  render(
    <>
      <VideoEditorFloatingInsertPanel
        activeInsertKind={null}
        controller={controller}
        effectsLibraryDock={effectsLibraryDock}
        onActiveInsertKindChange={vi.fn()}
      />
      <VideoEditorFloatingWorkspacePanel controller={controller} />
    </>
  );

  expect(queryButtonByUi('video-editor.floating.insert-panel.templates')).not.toBeNull();
  expect(queryButtonByUi('video-editor.floating.workspace-panel.effects-library')).toBeNull();
});

it('shows scene properties status only when scene properties are visible', () => {
  const controller = createFloatingWorkspaceController();
  render(<VideoEditorFloatingWorkspacePanel controller={controller} />);

  expect(queryButtonByUi('video-editor.floating.workspace-panel.scene')?.dataset['active']).toBe(
    undefined
  );

  controller.header.inspectorMode = 'selection';
  render(<VideoEditorFloatingWorkspacePanel controller={controller} />);

  const sceneButton = queryButtonByUi('video-editor.floating.workspace-panel.scene');
  expect(sceneButton?.dataset['active']).toBe('true');
  expect(sceneButton?.innerHTML).toContain('lucide-monitor-cog');
});

function render(node: ReactNode) {
  act(() => {
    root?.render(node);
  });
}

function createEffectsLibraryDock() {
  return {
    isOpen: true,
    onToggle: vi.fn(),
  };
}

function clickByLabel(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(
    `[aria-label="${label}"], [title="${label}"]`
  );
  expect(button).not.toBeNull();
  act(() => button?.click());
}

function importMediaFile(name: string, type: string) {
  clickByLabel(translate('videoEditor.app.mediaButton'));
  const input = container?.querySelector<HTMLInputElement>(
    `input[accept="${PROJECT_MEDIA_ACCEPT_ATTRIBUTE}"]`
  );
  expect(input).not.toBeNull();
  const file = new File(['asset'], name, { type });
  act(() => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function queryUi(dataUi: string) {
  return container?.querySelector(`[data-ui="${dataUi}"]`) ?? null;
}

function clickByUi(dataUi: string) {
  const button = queryButtonByUi(dataUi);
  expect(button).not.toBeNull();
  act(() => button?.click());
}

function queryButtonByUi(dataUi: string) {
  return container?.querySelector<HTMLButtonElement>(`button[data-ui="${dataUi}"]`) ?? null;
}
