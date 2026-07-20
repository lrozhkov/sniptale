import { expect, it } from 'vitest';

import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  parseBackgroundRuntimeMessage,
  parseRuntimeResponseForMessage,
} from '../../parsers/boundary';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

it('parses scenario capture-step requests on the background runtime boundary', () => {
  const message = parseBackgroundRuntimeMessage({
    type: MessageType.SCENARIO_SAVE_CAPTURE_STEP,
    dataUrl: 'data:image/png;base64,1',
    filename: 'capture.png',
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: {
      title: 'Example',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    title: 'Open menu',
  });

  expect(message.type).toBe(MessageType.SCENARIO_SAVE_CAPTURE_STEP);
  if (message.type !== MessageType.SCENARIO_SAVE_CAPTURE_STEP) {
    throw new Error('Expected scenario capture-step message');
  }

  expect(message.filename).toBe('capture.png');
  expect(message.captureSurface).toBe('visible');
});

it('parses scenario session responses with projects and step metadata', () => {
  const response = parseRuntimeResponseForMessage(MessageType.SCENARIO_SET_ACTIVE_PROJECT, {
    success: true,
    session: {
      enabled: true,
      captureMode: 'by-click',
      projectId: 'project-1',
      projectName: 'Project 1',
      rememberProjectSelection: true,
      pendingProjectSelection: false,
      sidebarVisible: true,
    },
    projects: [
      {
        id: 'project-1',
        name: 'Project 1',
        createdAt: 10,
        updatedAt: 20,
      },
    ],
    recentSteps: [
      {
        id: 'step-1',
        position: 0,
        previewDataUrl: 'data:image/png;base64,1',
        title: 'Step 1',
      },
    ],
    trashedSteps: [
      {
        id: 'step-2',
        deletedAt: 20,
        kind: 'capture',
        originalIndex: 1,
        title: 'Step 2',
      },
    ],
    projectId: 'project-1',
    stepId: 'step-1',
  });

  expect(response.success).toBe(true);
  expect(response.session?.projectId).toBe('project-1');
  expect(response.projects?.[0]?.name).toBe('Project 1');
  expect(response.recentSteps?.[0]?.title).toBe('Step 1');
  expect(response.trashedSteps?.[0]?.id).toBe('step-2');
  expect(response.stepId).toBe('step-1');
  expect(response.recentSteps?.[0]?.previewDataUrl).toBe('data:image/png;base64,1');
});

it('parses scenario editor, delete-step, move-step, and restore-step requests', () => {
  const openEditorMessage = parseBackgroundRuntimeMessage({
    type: MessageType.SCENARIO_OPEN_EDITOR,
    projectId: 'project-1',
    stepId: 'step-2',
  });
  const deleteStepMessage = parseBackgroundRuntimeMessage({
    type: MessageType.SCENARIO_DELETE_STEP,
    projectId: 'project-1',
    stepId: 'step-2',
  });
  const moveStepMessage = parseBackgroundRuntimeMessage({
    type: MessageType.SCENARIO_MOVE_STEP,
    projectId: 'project-1',
    stepId: 'step-2',
    toIndex: 3,
  });
  const restoreStepMessage = parseBackgroundRuntimeMessage({
    type: MessageType.SCENARIO_RESTORE_STEP,
    projectId: 'project-1',
    stepId: 'step-2',
  });

  expect(openEditorMessage).toMatchObject({
    type: MessageType.SCENARIO_OPEN_EDITOR,
    projectId: 'project-1',
    stepId: 'step-2',
  });
  expect(deleteStepMessage).toMatchObject({
    type: MessageType.SCENARIO_DELETE_STEP,
    projectId: 'project-1',
    stepId: 'step-2',
  });
  expect(moveStepMessage).toMatchObject({
    type: MessageType.SCENARIO_MOVE_STEP,
    toIndex: 3,
  });
  expect(restoreStepMessage).toMatchObject({
    type: MessageType.SCENARIO_RESTORE_STEP,
    projectId: 'project-1',
    stepId: 'step-2',
  });
});

it('rejects malformed scenario responses', () => {
  expect(() =>
    parseRuntimeResponseForMessage(MessageType.SCENARIO_GET_SESSION, {
      success: true,
      session: {
        enabled: 'yes',
      },
    })
  ).toThrow(MessageContractError);

  expect(() =>
    parseRuntimeResponseForMessage(MessageType.SCENARIO_GET_SESSION, {
      success: true,
      recentSteps: [{ id: 'step-1', previewDataUrl: 10, title: 'Step 1' }],
    })
  ).toThrow(MessageContractError);

  expect(() =>
    parseRuntimeResponseForMessage(MessageType.SCENARIO_SET_ACTIVE_PROJECT, {
      success: true,
      previewDataUrl: 'data:image/png;base64,raw',
    })
  ).toThrow(MessageContractError);
});
