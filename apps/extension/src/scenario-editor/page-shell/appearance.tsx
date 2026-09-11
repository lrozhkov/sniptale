import { guideDocumentStyle } from './document-appearance';
import { useState } from 'react';
import type {
  GuideProject,
  GuideStyle,
  GuideStyleOverrides,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { CollapsibleSection, SelectField } from '../../ui/compact-inspector-controls';
import { resolveGuideStyle } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { GuideTemplateFiles } from './template-files';

type AppearanceProps = {
  project: GuideProject;
  selectedId: string | null;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  t: Translate;
};

/** Appearance uses the existing buffer/undo authority; panel state is disposable. */
export function GuideAppearance({ project, selectedId, disabled, onChange, t }: AppearanceProps) {
  const [mode, setMode] = useState<'step' | 'project'>('step');
  const item = project.items.find((entry) => entry.id === selectedId);
  const step = item?.kind === 'step' ? item : null;
  const active = step ? mode : 'project';
  const customize = (styleOverrides: GuideStyleOverrides) => {
    if (!step) return;
    onChange({
      ...project,
      items: project.items.map((entry) =>
        entry.id === step.id ? { ...step, styleOverrides } : entry
      ),
    });
  };
  return (
    <div className="guide-appearance">
      {step && (
        <label className="guide-number-toggle">
          <input
            type="checkbox"
            disabled={disabled}
            checked={step.showNumber}
            onChange={(event) =>
              onChange({
                ...project,
                items: project.items.map((entry) =>
                  entry.id === step.id ? { ...step, showNumber: event.target.checked } : entry
                ),
              })
            }
          />
          {t('scenario.editor.guideShowNumber')}
        </label>
      )}
      <CollapsibleSection label={t('scenario.editor.appearance')} defaultOpen={false}>
        <div className="guide-appearance-fields">
          {step && (
            <SegmentedSwitch
              activeId={active}
              onChange={setMode}
              ariaLabel={t('scenario.editor.appearanceScope')}
              options={[
                { id: 'step', label: t('scenario.editor.appearanceStep') },
                { id: 'project', label: t('scenario.editor.appearanceProject') },
              ]}
            />
          )}
          {active === 'project' ? (
            <GuideStyleFields
              style={project.style}
              disabled={disabled}
              t={t}
              onChange={(style) => onChange({ ...project, style })}
            />
          ) : (
            step && (
              <>
                <SelectField
                  label={t('scenario.editor.appearanceLayout')}
                  value={step.layout}
                  disabled={disabled}
                  options={[
                    { value: 'stacked', label: t('scenario.editor.appearanceStacked') },
                    { value: 'side-by-side', label: t('scenario.editor.appearanceSideBySide') },
                    { value: 'comparison', label: t('scenario.editor.appearanceComparison') },
                    { value: 'text', label: t('scenario.editor.appearanceText') },
                  ]}
                  onChange={(layout) =>
                    onChange({
                      ...project,
                      items: project.items.map((entry) =>
                        entry.id === step.id
                          ? { ...step, layout, templateId: `builtin:${layout}` }
                          : entry
                      ),
                    })
                  }
                />
                <p>{t('scenario.editor.appearanceLayoutHint')}</p>
                {Object.keys(step.styleOverrides).length ? (
                  <>
                    <GuideStyleFields
                      style={resolveGuideStyle(project.style, step.styleOverrides)}
                      disabled={disabled}
                      t={t}
                      onChange={customize}
                    />
                    <ProductActionButton
                      tone="secondary"
                      compact
                      disabled={disabled}
                      onClick={() => customize({})}
                    >
                      {t('scenario.editor.appearanceReset')}
                    </ProductActionButton>
                  </>
                ) : (
                  <>
                    <p>{t('scenario.editor.appearanceInherited')}</p>
                    <ProductActionButton
                      tone="secondary"
                      compact
                      disabled={disabled}
                      onClick={() => customize({ ...project.style })}
                    >
                      {t('scenario.editor.appearanceCustomize')}
                    </ProductActionButton>
                  </>
                )}
                <GuideTemplateFiles
                  key={`${project.id}:${step.id}`}
                  project={project}
                  step={step}
                  disabled={disabled}
                  onChange={onChange}
                  t={t}
                />
              </>
            )
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function GuideStyleFields({
  style,
  disabled,
  onChange,
  t,
}: {
  style: GuideStyle;
  disabled: boolean;
  onChange: (style: GuideStyle) => void;
  t: Translate;
}) {
  return (
    <div className="guide-appearance-fields">
      <SelectField
        label={t('scenario.editor.appearanceTheme')}
        value={style.theme}
        disabled={disabled}
        options={[
          { value: 'paper', label: t('scenario.editor.appearancePaper') },
          { value: 'warm', label: t('scenario.editor.appearanceWarm') },
          { value: 'graphite', label: t('scenario.editor.appearanceGraphite') },
        ]}
        onChange={(theme) => onChange({ ...style, theme })}
      />
      <SelectField
        label={t('scenario.editor.appearanceFont')}
        value={style.font}
        disabled={disabled}
        options={[
          { value: 'sans', label: t('scenario.editor.appearanceSans') },
          { value: 'serif', label: t('scenario.editor.appearanceSerif') },
        ]}
        onChange={(font) => onChange({ ...style, font })}
      />
      <SelectField
        label={t('scenario.editor.appearanceDensity')}
        value={style.density}
        disabled={disabled}
        options={[
          { value: 'compact', label: t('scenario.editor.appearanceCompact') },
          { value: 'comfortable', label: t('scenario.editor.appearanceComfortable') },
          { value: 'spacious', label: t('scenario.editor.appearanceSpacious') },
        ]}
        onChange={(density) => onChange({ ...style, density })}
      />
      <SelectField
        label={t('scenario.editor.appearanceWidth')}
        value={style.contentWidth}
        disabled={disabled}
        options={[
          { value: 'narrow', label: t('scenario.editor.appearanceNarrow') },
          { value: 'standard', label: t('scenario.editor.appearanceStandard') },
          { value: 'wide', label: t('scenario.editor.appearanceWide') },
        ]}
        onChange={(contentWidth) => onChange({ ...style, contentWidth })}
      />
      <SelectField
        label={t('scenario.editor.appearanceBorder')}
        value={style.imageBorder}
        disabled={disabled}
        options={[
          { value: 'none', label: t('scenario.editor.appearanceNone') },
          { value: 'subtle', label: t('scenario.editor.appearanceSubtle') },
          { value: 'strong', label: t('scenario.editor.appearanceStrong') },
        ]}
        onChange={(imageBorder) => onChange({ ...style, imageBorder })}
      />
      <SelectField
        label={t('scenario.editor.appearanceNumber')}
        value={style.numberStyle}
        disabled={disabled}
        options={[
          { value: 'plain', label: t('scenario.editor.appearancePlain') },
          { value: 'badge', label: t('scenario.editor.appearanceBadge') },
        ]}
        onChange={(numberStyle) => onChange({ ...style, numberStyle })}
      />
      <label className="guide-appearance-accent">
        {t('scenario.editor.appearanceAccent')}
        <ProductInput
          type="color"
          value={guideDocumentStyle(style)['--guide-accent']}
          disabled={disabled}
          onChange={(event) => onChange({ ...style, accentColor: event.target.value })}
        />
      </label>
      <ProductActionButton
        tone="secondary"
        compact
        disabled={disabled || style.accentColor === null}
        onClick={() => onChange({ ...style, accentColor: null })}
      >
        {t('scenario.editor.appearanceAccentReset')}
      </ProductActionButton>
    </div>
  );
}
