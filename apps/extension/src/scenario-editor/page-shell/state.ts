import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  createElementCommands,
  createHistoryCommands,
  createProjectCommands,
  createSlideCommands,
} from './commands';
import { getEditorSelection, createInitialEditorSession } from './selection';
import {
  createScenarioProjectEchoState,
  reconcileIncomingScenarioProject,
  rememberScenarioProjectEcho,
  type ScenarioProjectEchoState,
} from './project-echo';
import type { ScenarioV3EditorShellProps } from './types';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

export function useScenarioV3EditorState(props: ScenarioV3EditorShellProps) {
  const { onProjectChange, project: initialProject } = props;
  const initialSlideId = props.initialSlideId ?? null;
  const [session, setSession] = useState(() =>
    createInitialEditorSession(initialProject, initialSlideId)
  );
  const [operationError, setOperationError] = useState<string | null>(null);
  const initialProjectRef = useRef(initialProject);
  const initialSlideIdRef = useRef(initialSlideId);
  const emittedProjectEchoRef = useRef<ScenarioProjectEchoState>(createScenarioProjectEchoState());
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const selection = getEditorSelection(session);

  useScenarioV3ProjectChangeEmitter({
    emittedProjectEchoRef,
    initialProjectRef,
    onProjectChange,
    project: session.project,
  });
  useScenarioV3IncomingProjectReconciliation({
    emittedProjectEchoRef,
    initialProject,
    initialProjectRef,
    initialSlideId,
    initialSlideIdRef,
    setSession,
  });

  return {
    canRedo: session.history.future.length > 0,
    canUndo: session.history.past.length > 0,
    elements: selection.selectedSlide.elements,
    history: createHistoryCommands(setSession),
    getCurrentProject: () => sessionRef.current.project,
    projectActions: createProjectCommands(setSession),
    project: session.project,
    selectedElement: selection.selectedElement,
    selectedElementId: session.selectedElementId,
    selectedSlide: selection.selectedSlide,
    slideActions: createSlideCommands(setSession),
    elementActions: createElementCommands(
      setSession,
      session.project.id,
      () => sessionRef.current,
      setOperationError
    ),
    operationError,
  };
}

function useScenarioV3ProjectChangeEmitter(args: {
  emittedProjectEchoRef: MutableRefObject<ScenarioProjectEchoState>;
  initialProjectRef: MutableRefObject<ScenarioProjectV3>;
  onProjectChange: ScenarioV3EditorShellProps['onProjectChange'];
  project: ScenarioProjectV3;
}) {
  const { emittedProjectEchoRef, initialProjectRef, onProjectChange, project } = args;
  useEffect(() => {
    if (project === initialProjectRef.current) {
      return;
    }
    rememberScenarioProjectEcho(emittedProjectEchoRef.current, project);
    onProjectChange?.(project);
  }, [emittedProjectEchoRef, initialProjectRef, onProjectChange, project]);
}

function useScenarioV3IncomingProjectReconciliation(args: {
  emittedProjectEchoRef: MutableRefObject<ScenarioProjectEchoState>;
  initialProject: ScenarioProjectV3;
  initialProjectRef: MutableRefObject<ScenarioProjectV3>;
  initialSlideId: string | null;
  initialSlideIdRef: MutableRefObject<string | null>;
  setSession: Dispatch<SetStateAction<ReturnType<typeof createInitialEditorSession>>>;
}) {
  const {
    emittedProjectEchoRef,
    initialProject,
    initialProjectRef,
    initialSlideId,
    initialSlideIdRef,
    setSession,
  } = args;
  useEffect(() => {
    const previousInitialSlideId = initialSlideIdRef.current;
    initialSlideIdRef.current = initialSlideId;
    initialProjectRef.current = initialProject;
    setSession((currentSession) =>
      reconcileIncomingScenarioProject({
        currentSession,
        initialProject,
        initialSlideId,
        previousInitialSlideId,
        emittedProjectEchoState: emittedProjectEchoRef.current,
      })
    );
  }, [
    emittedProjectEchoRef,
    initialProject,
    initialProjectRef,
    initialSlideId,
    initialSlideIdRef,
    setSession,
  ]);
}
