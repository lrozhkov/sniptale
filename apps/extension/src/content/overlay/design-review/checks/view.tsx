import { useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { InspectorDisclosureView } from '../../../../ui/compact-inspector-controls/disclosure';
import { translate } from '../../../../platform/i18n';
import type { ReviewCheckFinding } from '../../../selection/design-review/checks/scan';
import type { DesignReviewChecks } from '../session/checks';

export function reviewCheckReason(finding: ReviewCheckFinding): string {
  return translate(`content.designReview.check${finding.kind}`);
}
function evidence(finding: ReviewCheckFinding): string {
  const n = (value: number) => Math.round(value * 100) / 100;
  let label: string;
  let value: string;
  switch (finding.kind) {
    case 'missing-alt':
      label = translate('content.designReview.checkEvidenceAttribute');
      value = 'alt';
      break;
    case 'missing-name':
    case 'missing-label':
      label = translate('content.designReview.checkEvidenceTag');
      value = finding.evidence.tag;
      break;
    case 'positive-tabindex':
      label = translate('content.designReview.checkEvidenceTabindex');
      value = `tabindex=${finding.evidence.value}`;
      break;
    case 'contrast': {
      label = translate('content.designReview.checkEvidenceContrast');
      const ratio = `${n(finding.evidence.ratio)} / ${finding.evidence.required}`;
      const colors = `${finding.evidence.foreground} / ${finding.evidence.background}`;
      value = `${ratio} · ${colors}`;
      break;
    }
    case 'small-target':
      label = translate('content.designReview.checkEvidenceSize');
      value = `${n(finding.evidence.width)} × ${n(finding.evidence.height)}`;
      break;
    case 'text-clipping':
      label = translate('content.designReview.checkEvidenceClip');
      value = `${finding.evidence.clientWidth} / ${finding.evidence.scrollWidth}`;
      break;
    case 'horizontal-overflow':
      label = translate('content.designReview.checkEvidenceOverflow');
      value = `${n(finding.evidence.overflow)} / ${finding.evidence.available}`;
      break;
  }
  return `${label}: ${value}`;
}
export function DesignReviewChecksView(props: {
  checks: DesignReviewChecks;
  onFinding(finding: ReviewCheckFinding, action: 'show' | 'inspect' | 'comment'): void;
}) {
  const { checks } = props;
  const [limitsOpen, setLimitsOpen] = useState(false);
  const result = checks.result;
  return (
    <div className="grid min-w-0 gap-3 py-3" data-ui="content.design-review.checks">
      <p className="text-[var(--sniptale-color-text-secondary)]">
        {translate('content.designReview.checkAdvisory')}
      </p>
      <ProductSelect
        controlSize="sm"
        aria-label={translate('content.designReview.checkScope')}
        value={checks.scope}
        options={[
          { value: 'selected', label: translate('content.designReview.checkSelected') },
          { value: 'page', label: translate('content.designReview.checkPage') },
        ]}
        onChange={(value) => {
          if (value === 'selected' || value === 'page') checks.setScope(value);
        }}
      />
      <div className="flex flex-wrap gap-1">
        <ProductActionButton
          compact
          tone="secondary"
          disabled={!checks.canScan}
          onClick={checks.newScan}
        >
          {translate('content.designReview.checkNewScan')}
        </ProductActionButton>
        <ProductActionButton compact tone="secondary" disabled={!result} onClick={checks.recheck}>
          {translate('content.designReview.checkRecheck')}
        </ProductActionButton>
      </div>
      {checks.unavailable || checks.rootUnavailable ? (
        <p role="alert">{translate('content.designReview.checkUnavailable')}</p>
      ) : null}
      {checks.viewportChanged ? (
        <p role="status">{translate('content.designReview.checkViewportChanged')}</p>
      ) : null}
      {checks.navigationFailed ? (
        <p role="alert">{translate('content.designReview.checkNavigationFailed')}</p>
      ) : null}
      {result ? (
        <>
          <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
            <dt>{translate('content.designReview.checkRoot')}</dt>
            <dd className="break-words">
              {result.rootLabel} ·{' '}
              {translate(
                result.scope === 'page'
                  ? 'content.designReview.checkPage'
                  : 'content.designReview.checkSelected'
              )}
            </dd>
            <dt>{translate('content.designReview.checkViewport')}</dt>
            <dd>
              {result.viewport.width} × {result.viewport.height}
              {result.viewport.frame ? ' · iframe' : ''}
            </dd>
            <dt>{translate('content.designReview.checkCurrentViewport')}</dt>
            <dd>
              {checks.currentViewport?.width ?? '—'} × {checks.currentViewport?.height ?? '—'}
            </dd>
            <dt>{translate('content.designReview.checkFindingCount')}</dt>
            <dd>
              {result.findings.length} / {result.totalFindings}
            </dd>
            <dt>{translate('content.designReview.checkVisited')}</dt>
            <dd>
              {result.visited} / {result.inspected}
            </dd>
          </dl>
          {result.truncated ? (
            <p role="status">{translate('content.designReview.checkTruncated')}</p>
          ) : null}
          {!result.findings.length ? (
            <p role="status">{translate('content.designReview.checkEmpty')}</p>
          ) : null}
          <p>
            {translate('content.designReview.checkUnknownVisible')}: {result.skipped.unknownNames} /{' '}
            {result.skipped.unknownContrast} / {result.skipped.boundaries}
          </p>
          <ol className="grid gap-3">
            {result.findings.map((finding) => (
              <li
                key={finding.id}
                className="grid min-w-0 gap-1 border-t border-[var(--sniptale-color-border-soft)] pt-3"
                data-ui="content.design-review.check-finding"
              >
                <p className="font-medium">{reviewCheckReason(finding)}</p>
                <p className="break-words select-text">
                  {finding.label} · {evidence(finding)}
                </p>
                <div className="flex flex-wrap gap-1">
                  <ProductActionButton
                    compact
                    tone="secondary"
                    onClick={() => props.onFinding(finding, 'show')}
                  >
                    {translate('content.designReview.checkShow')}
                  </ProductActionButton>
                  {['contrast', 'small-target', 'text-clipping', 'horizontal-overflow'].includes(
                    finding.kind
                  ) ? (
                    <ProductActionButton
                      compact
                      tone="secondary"
                      onClick={() => props.onFinding(finding, 'inspect')}
                    >
                      {translate('content.designReview.checkProperties')}
                    </ProductActionButton>
                  ) : null}
                  <ProductActionButton
                    compact
                    tone="secondary"
                    onClick={() => props.onFinding(finding, 'comment')}
                  >
                    {translate('content.designReview.checkComment')}
                  </ProductActionButton>
                </div>
              </li>
            ))}
          </ol>
          <InspectorDisclosureView
            dataUi="content.design-review.check-limits"
            variant="information"
            label={translate('content.designReview.checkLimits')}
            open={limitsOpen}
            onOpenChange={setLimitsOpen}
            bodyClassName="pb-2 pt-2"
          >
            <p>
              {translate('content.designReview.checkSkipped')}: {result.skipped.hidden} /{' '}
              {result.skipped.owned} / {result.skipped.boundaries}
            </p>
            <p>
              {translate('content.designReview.checkUnknown')}: {result.skipped.unknownNames} /{' '}
              {result.skipped.unknownContrast}
            </p>
            <p>{translate('content.designReview.checkPaintLimit')}</p>
          </InspectorDisclosureView>
        </>
      ) : null}
    </div>
  );
}
