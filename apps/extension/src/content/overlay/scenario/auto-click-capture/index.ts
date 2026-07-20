import { useEffect, useRef } from 'react';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import {
  createScenarioClickReplayHandler,
  createScenarioKeyboardCaptureHandler,
  createScenarioPointerMoveHandler,
  createScenarioPointerDownHandler,
  createScenarioPointerUpHandler,
} from './helpers';
import type { PendingPointerCapture } from './metadata';
import * as scenarioAutoClickDomDriver from './dom-driver';
import { defaultScenarioAutoClickCaptureTransport } from './shared';
import type {
  BuildScenarioCapturePayload,
  PendingReplayClick,
  ScenarioAutoClickCaptureTransport,
  ScenarioAutoClickListenerHandlers,
  ScenarioAutoClickListenerRegistry,
  ScenarioAutoClickRefs,
} from './types';

export function useScenarioAutoClickCapture(params: {
  blocked: boolean;
  screenshotMode: boolean;
  session: ScenarioSessionState;
  buildCapturePayload: BuildScenarioCapturePayload;
  captureTransport?: ScenarioAutoClickCaptureTransport;
  registerListeners?: ScenarioAutoClickListenerRegistry;
  refreshSession: () => Promise<void>;
  setIsCompletelyHidden: (hidden: boolean) => void;
}) {
  const scenarioAutoClickRefs = useScenarioAutoClickRefs(params);
  const handlersRef = useRef<ScenarioAutoClickListenerHandlers | null>(null);

  if (!handlersRef.current) {
    handlersRef.current = {
      clickReplayHandler: createScenarioClickReplayHandler(scenarioAutoClickRefs),
      keyboardCaptureHandler: createScenarioKeyboardCaptureHandler(scenarioAutoClickRefs),
      pointerDownHandler: createScenarioPointerDownHandler(scenarioAutoClickRefs),
      pointerMoveHandler: createScenarioPointerMoveHandler(scenarioAutoClickRefs),
      pointerUpHandler: createScenarioPointerUpHandler(scenarioAutoClickRefs),
    };
  }

  useScenarioAutoClickListeners({
    clickReplayHandler: handlersRef.current.clickReplayHandler,
    enabled: params.screenshotMode && params.session.enabled,
    keyboardCaptureHandler: handlersRef.current.keyboardCaptureHandler,
    pointerMoveHandler: handlersRef.current.pointerMoveHandler,
    pointerDownHandler: handlersRef.current.pointerDownHandler,
    pointerUpHandler: handlersRef.current.pointerUpHandler,
    ...(params.registerListeners === undefined
      ? {}
      : { registerListeners: params.registerListeners }),
  });
}

function useScenarioAutoClickRefs(params: {
  blocked: boolean;
  buildCapturePayload: BuildScenarioCapturePayload;
  captureTransport?: ScenarioAutoClickCaptureTransport;
  refreshSession: () => Promise<void>;
  session: ScenarioSessionState;
  setIsCompletelyHidden: (hidden: boolean) => void;
}) {
  const blockedRef = useRef(params.blocked);
  const captureTransportRef = useRef(
    params.captureTransport ?? defaultScenarioAutoClickCaptureTransport
  );
  const pendingReplayClickRef = useRef<PendingReplayClick | null>(null);
  const pendingPointerCaptureRef = useRef<PendingPointerCapture | null>(null);
  const replayingClickRef = useRef(false);
  const clickCapturePromiseRef = useRef<Promise<boolean> | null>(null);
  const sessionRef = useRef(params.session);
  const buildCapturePayloadRef = useRef(params.buildCapturePayload);
  const refreshSessionRef = useRef(params.refreshSession);
  const setIsCompletelyHiddenRef = useRef(params.setIsCompletelyHidden);
  const scenarioAutoClickRefsRef = useRef<ScenarioAutoClickRefs | null>(null);

  blockedRef.current = params.blocked;
  captureTransportRef.current = params.captureTransport ?? defaultScenarioAutoClickCaptureTransport;
  sessionRef.current = params.session;
  buildCapturePayloadRef.current = params.buildCapturePayload;
  refreshSessionRef.current = params.refreshSession;
  setIsCompletelyHiddenRef.current = params.setIsCompletelyHidden;

  if (!scenarioAutoClickRefsRef.current) {
    scenarioAutoClickRefsRef.current = {
      blockedRef,
      buildCapturePayloadRef,
      captureTransportRef,
      clickCapturePromiseRef,
      pendingPointerCaptureRef,
      pendingReplayClickRef,
      refreshSessionRef,
      replayingClickRef,
      sessionRef,
      setIsCompletelyHiddenRef,
    };
  }

  return scenarioAutoClickRefsRef.current;
}

function useScenarioAutoClickListeners(
  args: ScenarioAutoClickListenerHandlers & {
    enabled: boolean;
    registerListeners?: ScenarioAutoClickListenerRegistry;
  }
) {
  const {
    clickReplayHandler,
    enabled,
    keyboardCaptureHandler,
    pointerDownHandler,
    pointerMoveHandler,
    pointerUpHandler,
    registerListeners,
  } = args;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const register =
      registerListeners ?? scenarioAutoClickDomDriver.registerScenarioAutoClickListeners;
    return register({
      clickReplayHandler,
      keyboardCaptureHandler,
      pointerDownHandler,
      pointerMoveHandler,
      pointerUpHandler,
    });
  }, [
    clickReplayHandler,
    enabled,
    keyboardCaptureHandler,
    pointerDownHandler,
    pointerMoveHandler,
    pointerUpHandler,
    registerListeners,
  ]);
}
