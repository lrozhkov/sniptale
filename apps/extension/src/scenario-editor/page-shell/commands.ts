import type { Dispatch, SetStateAction } from 'react';
import { translate } from '../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  ScenarioElement,
  ScenarioV3ElementKind,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioInspectorSlidePatch } from '../inspector';
import { redoProjectHistory, pushProjectHistory, undoProjectHistory } from './history';
import { insertImageFileIntoSelectedSlide } from './image-import';
import {
  createInsertedElement,
  createInsertedElementAtPoint,
  createInsertedElementFromDrag,
} from './insert';
import {
  addProjectSlide,
  appendProjectSlide,
  deleteProjectSlide,
  deleteSlideElement,
  duplicateProjectSlide,
  moveProjectSlide,
  moveSlideElement,
  replaceProjectSlide,
  updateProjectPresentationSettings,
  updateSlideElement,
  updateSlideSettings,
  type ScenarioV3ElementPatch,
} from './mutations';
import { keepReachableSelection } from './selection';
import { insertSlideElementIntoSession } from './session-element-insert';
import type { ScenarioV3EditorSession } from './types';
import type { ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/v3';

type SetSession = Dispatch<SetStateAction<ScenarioV3EditorSession>>;
type GetSession = () => ScenarioV3EditorSession;
type OperationErrorReporter = (message: string | null) => void;
type SelectionPatch = Pick<ScenarioV3EditorSession, 'selectedElementId' | 'selectedSlideId'>;
const logger = createLogger({ namespace: 'ScenarioEditorV3Commands' });

export function createHistoryCommands(setSession: SetSession) {
  return {
    redo: () => applyHistoryStep(setSession, 'redo'),
    undo: () => applyHistoryStep(setSession, 'undo'),
  };
}

export function createSlideCommands(setSession: SetSession) {
  return {
    addSlide: () => commitMutation(setSession, addProjectSlide, selectLastSlide),
    addTemplateSlide: (slide: ScenarioV3EditorSession['project']['slides'][number]) =>
      commitMutation(setSession, (project) => appendProjectSlide(project, slide), selectLastSlide),
    deleteSlide: (slideId: string) =>
      commitMutation(setSession, (project) => deleteProjectSlide(project, slideId)),
    duplicateSlide: (slideId: string) =>
      commitMutation(setSession, (project) => duplicateProjectSlide(project, slideId)),
    moveSlide: (slideId: string, direction: 'down' | 'up') =>
      commitMutation(setSession, (project) => moveProjectSlide(project, slideId, direction)),
    selectSlide: (slideId: string) =>
      setSession((session) => ({ ...session, selectedElementId: null, selectedSlideId: slideId })),
    updateSlide: (patch: ScenarioInspectorSlidePatch) =>
      commitSelectedSlideMutation(setSession, (project, slideId) =>
        updateSlideSettings(project, slideId, patch)
      ),
    replaceSelectedSlide: (slide: ScenarioV3EditorSession['project']['slides'][number]) =>
      commitSelectedSlideMutation(setSession, (project, slideId) =>
        replaceProjectSlide(project, slideId, slide)
      ),
  };
}

export function createProjectCommands(setSession: SetSession) {
  return {
    applyProject: (nextProject: ScenarioV3EditorSession['project']) =>
      commitMutation(setSession, () => nextProject),
    updatePresentation: (patch: Parameters<typeof updateProjectPresentationSettings>[1]) =>
      commitMutation(setSession, (project) => updateProjectPresentationSettings(project, patch)),
  };
}

export function createElementCommands(
  setSession: SetSession,
  projectId: string | null = null,
  getSession: GetSession | null = null,
  reportOperationError: OperationErrorReporter | null = null
) {
  return {
    deleteElement: (elementId: string) =>
      commitSelectedSlideMutation(setSession, (project, slideId) =>
        deleteSlideElement(project, slideId, elementId)
      ),
    insertElement: (kind: ScenarioV3ElementKind) =>
      insertElementKindIntoSelectedSlide(setSession, kind),
    insertElementAtPoint: (kind: ScenarioV3ElementKind, point: ScenarioPoint) =>
      insertElementKindIntoSelectedSlideAtPoint(setSession, kind, point),
    insertElementFromDrag: (
      kind: ScenarioV3ElementKind,
      origin: ScenarioPoint,
      current: ScenarioPoint
    ) => insertElementKindIntoSelectedSlideFromDrag(setSession, kind, origin, current),
    insertImageFile: (file?: File) =>
      insertImageFileWithErrorHandling({
        file,
        getSession,
        projectId,
        reportOperationError,
        setSession,
      }),
    moveElement: (elementId: string, direction: 'backward' | 'forward') =>
      commitSelectedSlideMutation(setSession, (project, slideId) =>
        moveSlideElement(project, slideId, elementId, direction)
      ),
    selectElement: (elementId: string) =>
      setSession((session) => ({ ...session, selectedElementId: elementId })),
    selectSlideSurface: () => setSession((session) => ({ ...session, selectedElementId: null })),
    updateElement: (elementId: string, patch: ScenarioV3ElementPatch) =>
      commitSelectedSlideMutation(setSession, (project, slideId) =>
        updateSlideElement(project, slideId, elementId, patch)
      ),
  };
}

async function insertImageFileWithErrorHandling(args: {
  file: File | undefined;
  getSession: GetSession | null;
  projectId: string | null;
  reportOperationError: OperationErrorReporter | null;
  setSession: SetSession;
}): Promise<void> {
  if (!args.file) {
    return;
  }

  args.reportOperationError?.(null);
  try {
    await insertImageFileIntoSelectedSlide(args);
  } catch (error: unknown) {
    logger.error('Failed to insert scenario image layer', error);
    args.reportOperationError?.(translate('scenario.editor.v3OperationFailed'));
  }
}

function applyHistoryStep(setSession: SetSession, direction: 'redo' | 'undo') {
  setSession((session) => {
    const result =
      direction === 'undo'
        ? undoProjectHistory({ currentProject: session.project, history: session.history })
        : redoProjectHistory({ currentProject: session.project, history: session.history });

    return result
      ? {
          ...session,
          ...keepReachableSelection(session, result.project),
          history: result.history,
          project: result.project,
        }
      : session;
  });
}

function commitMutation(
  setSession: SetSession,
  updateProject: (
    project: ScenarioV3EditorSession['project']
  ) => ScenarioV3EditorSession['project'],
  selectNext: (
    session: ScenarioV3EditorSession,
    nextProject: ScenarioV3EditorSession['project']
  ) => SelectionPatch = keepReachableSelection
) {
  setSession((session) => {
    const nextProject = updateProject(session.project);
    if (Object.is(nextProject, session.project)) {
      return session;
    }

    return {
      ...session,
      ...selectNext(session, nextProject),
      history: pushProjectHistory(session.history, session.project, nextProject),
      project: nextProject,
    };
  });
}

function commitSelectedSlideMutation(
  setSession: SetSession,
  updateProject: (
    project: ScenarioV3EditorSession['project'],
    slideId: string
  ) => ScenarioV3EditorSession['project']
) {
  setSession((session) => {
    const slideId = session.selectedSlideId ?? session.project.slides[0]?.id;
    if (!slideId) {
      return session;
    }

    const nextProject = updateProject(session.project, slideId);
    if (Object.is(nextProject, session.project)) {
      return session;
    }

    return {
      ...session,
      ...keepReachableSelection(session, nextProject),
      history: pushProjectHistory(session.history, session.project, nextProject),
      project: nextProject,
    };
  });
}

function insertElementKindIntoSelectedSlide(setSession: SetSession, kind: ScenarioV3ElementKind) {
  insertElementIntoSelectedSlide(setSession, createInsertedElement(kind));
}

function insertElementKindIntoSelectedSlideAtPoint(
  setSession: SetSession,
  kind: ScenarioV3ElementKind,
  point: ScenarioPoint
) {
  setSession((session) => {
    const slide = getSelectedSlide(session);
    return slide
      ? insertElementIntoSession(
          session,
          createInsertedElementAtPoint({ canvas: slide.canvas, kind, point })
        )
      : session;
  });
}

function insertElementKindIntoSelectedSlideFromDrag(
  setSession: SetSession,
  kind: ScenarioV3ElementKind,
  origin: ScenarioPoint,
  current: ScenarioPoint
) {
  setSession((session) => {
    const slide = getSelectedSlide(session);
    return slide
      ? insertElementIntoSession(
          session,
          createInsertedElementFromDrag({ canvas: slide.canvas, current, kind, origin })
        )
      : session;
  });
}

function insertElementIntoSelectedSlide(setSession: SetSession, element: ScenarioElement) {
  setSession((session) => insertElementIntoSession(session, element));
}

function insertElementIntoSession(
  session: ScenarioV3EditorSession,
  element: ScenarioElement
): ScenarioV3EditorSession {
  const slideId = session.selectedSlideId ?? session.project.slides[0]?.id;
  if (!slideId) {
    return session;
  }

  return insertSlideElementIntoSession({ element, session, slideId });
}

function selectLastSlide(
  session: ScenarioV3EditorSession,
  nextProject: ScenarioV3EditorSession['project']
) {
  return {
    selectedElementId: null,
    selectedSlideId: nextProject.slides.at(-1)?.id ?? session.selectedSlideId,
  };
}

function getSelectedSlide(session: ScenarioV3EditorSession) {
  const slideId = session.selectedSlideId ?? session.project.slides[0]?.id;
  return session.project.slides.find((slide) => slide.id === slideId) ?? null;
}
