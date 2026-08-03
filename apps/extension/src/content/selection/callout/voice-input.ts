import { useCallback, useEffect, useRef } from 'react';
import type { VoiceInputClient } from '../../../workflows/voice-input';
import { useContentVoiceInputSession } from '../../voice-input/session';
import { sanitizeCalloutHtml } from './dom';
import {
  createCalloutTranscriptInsertion,
  type CalloutTranscriptInsertion,
} from './voice-transcript';

export function useCalloutVoiceInput(args: {
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  createClient?: (() => VoiceInputClient) | undefined;
  isEditing: boolean;
  onContentChange(html: string): void;
}) {
  const insertionRef = useRef<CalloutTranscriptInsertion | null>(null);
  const onContentChangeRef = useRef(args.onContentChange);
  onContentChangeRef.current = args.onContentChange;
  const session = useContentVoiceInputSession({
    createClient: args.createClient,
    onTranscript: (event) => {
      const editable = args.contentEditableRef.current;
      if (!editable || !insertionRef.current?.apply(event)) return;
      onContentChangeRef.current(sanitizeCalloutHtml(editable.innerHTML));
    },
  });
  const startSession = session.actions.start;
  const stop = session.actions.stop;

  const start = useCallback(() => {
    const editable = args.contentEditableRef.current;
    if (!editable || !args.isEditing) return;
    insertionRef.current = createCalloutTranscriptInsertion(editable);
    void startSession();
  }, [args.contentEditableRef, args.isEditing, startSession]);

  useEffect(() => {
    if (args.isEditing) return;
    insertionRef.current = null;
    stop();
  }, [args.isEditing, stop]);

  return { actions: { start, stop }, state: session.state };
}
