import { expect, it } from 'vitest';
import { createCameraFollowSettings } from '../../project/camera/cursor-policy';
import { createQuickEditAdvancedState, createQuickEditAdvancedContent } from './defaults';
import { loadQuickEditAdvancedState, loadQuickEditAdvancedContentState } from './validation';

it('retains defaults and local camera policy through native serialization and history admission', () => {
  const content = {
    ...createQuickEditAdvancedContent(),
    cameraFollowDefaults: createCameraFollowSettings('calm'),
    zoom: {
      enabled: true,
      regions: [
        {
          id: 'camera',
          start: 0,
          end: 2,
          followCursor: true,
          cameraFollow: createCameraFollowSettings('fast'),
          transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
          enter: { type: 'none', duration: 0 },
          exit: { type: 'none', duration: 0 },
        },
      ],
    },
  };
  const reopened = loadQuickEditAdvancedContentState(JSON.parse(JSON.stringify(content)));
  expect(reopened).toEqual(content);
  expect(loadQuickEditAdvancedContentState(reopened)).toEqual(reopened);
  expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 19 })).toBeNull();
  expect(
    loadQuickEditAdvancedContentState({
      ...content,
      cameraFollowDefaults: { transitionDuration: 0.5 },
    })
  ).toBeNull();
});

it('continues reading the released schema nineteen without inserting new policy', () => {
  const previous = { ...createQuickEditAdvancedContent(), schemaVersion: 19 };
  expect(loadQuickEditAdvancedContentState(previous)).toEqual({
    ...previous,
    schemaVersion: createQuickEditAdvancedContent().schemaVersion,
  });
});

it('preserves theme workspace colors, rejects malformed colors, and leaves legacy UI absent', () => {
  const state = createQuickEditAdvancedState();
  expect(
    loadQuickEditAdvancedState({ ...state, schemaVersion: 21 })?.ui.workspaceColors
  ).toBeUndefined();
  const value = {
    ...state,
    ui: { ...state.ui, workspaceColors: { light: '#abcdef', dark: '#123456' } },
  };
  expect(loadQuickEditAdvancedState(JSON.parse(JSON.stringify(value)))?.ui.workspaceColors).toEqual(
    { light: '#abcdefff', dark: '#123456ff' }
  );
  for (const workspaceColors of [null, [], { light: 'url(https://example.com)' }, { dark: 3 }]) {
    expect(
      loadQuickEditAdvancedState({ ...state, ui: { ...state.ui, workspaceColors } })
    ).toBeNull();
  }
});
