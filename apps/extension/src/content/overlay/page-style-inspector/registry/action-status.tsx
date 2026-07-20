import { useCallback, useRef, useState } from 'react';
import { translate } from '../../../../platform/i18n';
import { ActionStatusBanner } from '../action-status-banner';
import type { PageStyleInspectorActionOutcome } from '../types';

type RegistryActionState = 'error' | 'pending' | 'success' | 'warning';

interface RegistryActionStatus {
  message: string;
  state: RegistryActionState;
}

export function useRegistryActionRunner() {
  const [status, setStatus] = useState<RegistryActionStatus | null>(null);
  const sequenceRef = useRef(0);

  const run = useCallback(
    async (args: {
      action: () => Promise<PageStyleInspectorActionOutcome>;
      successMessage: string;
    }) => {
      const sequence = sequenceRef.current + 1;
      sequenceRef.current = sequence;
      setStatus({
        message: translate('content.pageStyleInspector.ruleActionPending'),
        state: 'pending',
      });

      try {
        const outcome = await args.action();
        if (sequenceRef.current === sequence) {
          setStatus({
            message: outcome?.message ?? args.successMessage,
            state: outcome?.state ?? 'success',
          });
        }
      } catch {
        if (sequenceRef.current === sequence) {
          setStatus({
            message: translate('content.pageStyleInspector.ruleActionFailed'),
            state: 'error',
          });
        }
      }
    },
    []
  );

  return { run, status };
}

export function RegistryActionStatusBanner(props: { status: RegistryActionStatus | null }) {
  return <ActionStatusBanner status={props.status} />;
}
