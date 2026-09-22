import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import './export-workspace.css';

/**
 * Shared export chrome: one central preview surface and one full-height inspector.
 * The shell owns only layout, Escape dismissal and initial back focus; each export
 * mode keeps its own job, preparation and artifact state.
 */
export function GuideExportWorkspace({
  className,
  title,
  backLabel,
  headingMeta,
  stageLabel,
  stage,
  inspector,
  status,
  actions,
  onClose,
}: {
  className?: string;
  title: string;
  backLabel: string;
  headingMeta?: ReactNode;
  stageLabel: string;
  stage: ReactNode;
  inspector: ReactNode;
  status?: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    back.current?.focus();
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <main className={`guide-export-workspace${className ? ` ${className}` : ''}`}>
      <section className="guide-export-stage" aria-label={stageLabel}>
        {stage}
      </section>
      <aside className="guide-export-inspector guide-export-controls" aria-label={title}>
        <header className="guide-export-heading">
          <ContentToolbarButton
            className="guide-labeled-action"
            ref={back}
            title={backLabel}
            onClick={onClose}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{backLabel}</span>
          </ContentToolbarButton>
          <h1>{title}</h1>
          {headingMeta}
        </header>
        <div className="guide-export-inspector-body">{inspector}</div>
        <footer className="guide-export-actions">
          {status}
          {actions}
        </footer>
      </aside>
    </main>
  );
}
