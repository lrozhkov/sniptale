import { useLayoutEffect, useRef, useState } from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  isFrameHiddenDuringCapture,
  setFrameHiddenDuringCapture,
} from '../../../../features/highlighter/frame-annotation/capture-visibility';

type CaptureVisibilityAuthority = {
  authoritativeValue: boolean;
  frameId: string;
};

export type FrameCaptureVisibilityState = {
  hiddenDuringCapture: boolean;
  toggle: () => void;
};

export function useFrameCaptureVisibilityState(props: {
  frame: FrameData;
  onUpdate: (frame: FrameData) => void;
}) {
  const authoritativeValue = isFrameHiddenDuringCapture(props.frame);
  const authorityRef = useRef<CaptureVisibilityAuthority>({
    authoritativeValue,
    frameId: props.frame.id,
  });
  const [value, setValue] = useState(authoritativeValue);
  const authoritativeChanged =
    authorityRef.current.frameId !== props.frame.id ||
    authorityRef.current.authoritativeValue !== authoritativeValue;
  const hiddenDuringCapture = authoritativeChanged ? authoritativeValue : value;
  useLayoutEffect(() => {
    authorityRef.current = {
      authoritativeValue,
      frameId: props.frame.id,
    };
    setValue(authoritativeValue);
  }, [authoritativeValue, props.frame.id]);

  const toggle = () => {
    const nextValue = !hiddenDuringCapture;
    setValue(nextValue);
    props.onUpdate(setFrameHiddenDuringCapture(props.frame, nextValue) as FrameData);
  };

  return { hiddenDuringCapture, toggle } satisfies FrameCaptureVisibilityState;
}
