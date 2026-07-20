import { useCallback, useRef, useState } from 'react';
import type { PageStyleTemplate } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import { ActionStatusBanner } from '../action-status-banner';
import {
  TEMPLATE_ACTION_SUCCESS_KEYS,
  type TemplateActionKind,
  type TemplateActionStatus,
} from './model';
import type { PageStyleTemplateActionOutcome } from '../types';

export function useTemplateActionRunner() {
  const [status, setStatus] = useState<TemplateActionStatus | null>(null);
  const sequenceRef = useRef(0);

  const run = useCallback(
    async (args: {
      action: () => Promise<PageStyleTemplateActionOutcome>;
      kind: TemplateActionKind;
      template: PageStyleTemplate;
    }) => {
      const sequence = sequenceRef.current + 1;
      sequenceRef.current = sequence;
      setStatus({
        kind: args.kind,
        message: translate('content.pageStyleInspector.templateActionPending'),
        state: 'pending',
        templateId: args.template.id,
      });

      try {
        const outcome = (await args.action()) as PageStyleTemplateActionOutcome;
        if (sequenceRef.current === sequence) {
          setStatus({
            kind: args.kind,
            message: outcome?.message ?? translate(TEMPLATE_ACTION_SUCCESS_KEYS[args.kind]),
            state: outcome?.state ?? 'success',
            templateId: args.template.id,
          });
        }
      } catch {
        if (sequenceRef.current === sequence) {
          setStatus({
            kind: args.kind,
            message: translate('content.pageStyleInspector.templateActionFailed'),
            state: 'error',
            templateId: args.template.id,
          });
        }
      }
    },
    []
  );

  return { run, status };
}

export function TemplateStatusBanner(props: { status: TemplateActionStatus | null }) {
  return <ActionStatusBanner status={props.status} />;
}
