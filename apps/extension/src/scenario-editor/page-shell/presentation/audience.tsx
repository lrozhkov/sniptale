import { useEffect, useRef, useState } from 'react';
import { translate } from '../../../platform/i18n';
import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';
import { renderScenarioSlide } from '../../project/stage-render/slide';
import {
  loadScenarioPresentationSession,
  SCENARIO_PRESENTATION_SESSION_STATUS,
  subscribeToScenarioPresentationSession,
  type ScenarioPresentationSessionState,
} from './session';
import type {
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { useScenarioV3RenderAssetState } from '../assets';
import { ScenarioPresentationSlideFrame } from './transition';

export function ScenarioAudiencePresentationPage(props: {
  project: ScenarioProjectV3;
  reloadProject: () => Promise<void>;
  sessionId: string | null;
}) {
  const assetState = useScenarioV3RenderAssetState(props.project);
  const session = useScenarioAudienceSession({
    projectUpdatedAt: props.project.updatedAt,
    reloadProject: props.reloadProject,
    sessionId: props.sessionId,
  });

  if (
    !session ||
    session.status === SCENARIO_PRESENTATION_SESSION_STATUS.ended ||
    session.projectId !== props.project.id
  ) {
    return <ScenarioAudienceWaitingState />;
  }

  const slide = props.project.slides.find((candidate) => candidate.id === session.slideId);
  if (!slide) {
    return <ScenarioAudienceWaitingState />;
  }

  return (
    <ScenarioAudiencePlaySurface
      assets={assetState.assets}
      clickIndex={session.clickIndex}
      slide={slide}
    />
  );
}

function ScenarioAudiencePlaySurface(props: {
  assets: ScenarioSlideRenderAssetMap;
  clickIndex: number;
  slide: ScenarioSlide;
}) {
  const rendered = renderScenarioSlide(props.slide, {
    assets: props.assets,
    clickIndex: props.clickIndex,
    mode: 'export',
    outputWidth: 1280,
  });

  return (
    <main
      data-ui="scenario.editor.v3.audience"
      className="grid h-screen min-h-0 place-items-center overflow-auto bg-black px-6 py-5"
    >
      <ScenarioPresentationSlideFrame clickIndex={props.clickIndex} rendered={rendered} />
    </main>
  );
}

function ScenarioAudienceWaitingState() {
  return (
    <main
      data-ui="scenario.editor.v3.audience-waiting"
      className="grid h-screen place-items-center bg-black px-6 text-center text-sm text-zinc-300"
    >
      {translate('scenario.editor.audienceWaiting')}
    </main>
  );
}

function useScenarioAudienceSession(args: {
  projectUpdatedAt: number;
  reloadProject: () => Promise<void>;
  sessionId: string | null;
}) {
  const { projectUpdatedAt, reloadProject, sessionId } = args;
  const [session, setSession] = useState<ScenarioPresentationSessionState | null>(null);
  const latestRevisionRef = useRef(-1);

  useEffect(() => {
    if (!sessionId) {
      latestRevisionRef.current = -1;
      setSession(null);
      return undefined;
    }

    let cancelled = false;
    void loadScenarioPresentationSession(sessionId).then((loadedSession) => {
      if (!cancelled && shouldApplyAudienceSession(loadedSession, latestRevisionRef.current)) {
        latestRevisionRef.current = loadedSession?.revision ?? latestRevisionRef.current;
        setSession(loadedSession);
      }
    });

    const unsubscribe = subscribeToScenarioPresentationSession(sessionId, (nextSession) => {
      if (!shouldApplyAudienceSession(nextSession, latestRevisionRef.current)) {
        return;
      }
      latestRevisionRef.current = nextSession?.revision ?? latestRevisionRef.current;
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId]);

  useEffect(() => {
    if (
      session?.status === SCENARIO_PRESENTATION_SESSION_STATUS.active &&
      session.projectUpdatedAt > projectUpdatedAt
    ) {
      void reloadProject();
    }
  }, [projectUpdatedAt, reloadProject, session]);

  return session;
}

function shouldApplyAudienceSession(
  session: ScenarioPresentationSessionState | null,
  latestRevision: number
): boolean {
  return !session || session.revision > latestRevision;
}
