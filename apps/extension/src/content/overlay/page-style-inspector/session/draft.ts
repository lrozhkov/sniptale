import { useEffect, useMemo, useState } from 'react';
import type { PageStylePatch } from '@sniptale/runtime-contracts/page-style';
import type { PageStyleSelectionSnapshot } from '../runtime/properties';
import { createPageStyleValuesFromPatch } from '../runtime/properties';
import {
  createManualPageStylePatch,
  listModifiedPageStyleProperties,
} from '../value-editing/state';
import { createDefaultRuleName, createDefaultTemplateName } from '../save/flow';

export function usePageStyleDraftState(selection: PageStyleSelectionSnapshot | null) {
  const valueDraft = usePageStyleValueDraft();
  const nameDraft = usePageStyleNameDraft();
  const retentionDraft = usePageStyleRetentionDraft();
  const sideFieldDraft = useSideFieldDraft();
  const [assetPatch, setAssetPatch] = useState<PageStylePatch>({ assets: [], declarations: [] });

  useSelectionDraftReset({
    selection,
    setAssetPatch,
    setDefaultValues: valueDraft.setDefaultValues,
    setIncludeComputedInTemplate: retentionDraft.setIncludeComputedInTemplate,
    setRetainImage: retentionDraft.setRetainImage,
    setRetainText: retentionDraft.setRetainText,
    setRuleName: nameDraft.setRuleName,
    setSideFieldLinks: sideFieldDraft.setSideFieldLinks,
    setTemplateName: nameDraft.setTemplateName,
    setValues: valueDraft.setValues,
  });

  const draftPatch = useDraftPatch({
    assetPatch,
    defaultValues: valueDraft.defaultValues,
    values: valueDraft.values,
  });
  const modifiedProperties = useMemo(
    () =>
      listModifiedPageStyleProperties({
        defaultValues: valueDraft.defaultValues,
        values: valueDraft.values,
      }),
    [valueDraft.defaultValues, valueDraft.values]
  );

  return createDraftState({
    asset: { assetPatch, draftPatch, modifiedProperties, setAssetPatch },
    flags: retentionDraft.flags,
    setters: retentionDraft.setters,
    sideFields: sideFieldDraft.state,
    values: valueDraft.state,
    names: nameDraft,
  });
}

function createEmptyPageStyleValues() {
  return createPageStyleValuesFromPatch({ assets: [], declarations: [] });
}

function usePageStyleValueDraft() {
  const [defaultValues, setDefaultValues] = useState(createEmptyPageStyleValues);
  const [values, setValues] = useState(createEmptyPageStyleValues);

  return {
    defaultValues,
    setDefaultValues,
    setValues,
    values,
    state: { defaultValues, setValues, values },
  };
}

function usePageStyleNameDraft() {
  const [templateName, setTemplateName] = useState('');
  const [templateQuery, setTemplateQuery] = useState('');
  const [ruleName, setRuleName] = useState('');
  const [ruleQuery, setRuleQuery] = useState('');

  return {
    ruleName,
    ruleQuery,
    setRuleName,
    setRuleQuery,
    setTemplateName,
    setTemplateQuery,
    templateName,
    templateQuery,
  };
}

function usePageStyleRetentionDraft() {
  const [retainText, setRetainText] = useState(false);
  const [retainImage, setRetainImage] = useState(false);
  const [includeComputedInTemplate, setIncludeComputedInTemplate] = useState(false);

  return {
    flags: { includeComputedInTemplate, retainImage, retainText },
    setters: { setIncludeComputedInTemplate, setRetainImage, setRetainText },
    setIncludeComputedInTemplate,
    setRetainImage,
    setRetainText,
  };
}

function useSideFieldDraft() {
  const [sideFieldLinks, setSideFieldLinks] = useState<Record<string, boolean>>({});

  return {
    setSideFieldLinks,
    state: {
      setSideFieldLinked: (fieldKey: string, linked: boolean) =>
        setSideFieldLinks((current) => ({ ...current, [fieldKey]: linked })),
      sideFieldLinks,
    },
  };
}

function useSelectionDraftReset(args: {
  selection: PageStyleSelectionSnapshot | null;
  setAssetPatch: (patch: PageStylePatch) => void;
  setDefaultValues: (values: ReturnType<typeof createPageStyleValuesFromPatch>) => void;
  setIncludeComputedInTemplate: (value: boolean) => void;
  setRetainImage: (value: boolean) => void;
  setRetainText: (value: boolean) => void;
  setRuleName: (value: string) => void;
  setSideFieldLinks: (value: Record<string, boolean>) => void;
  setTemplateName: (value: string) => void;
  setValues: (values: ReturnType<typeof createPageStyleValuesFromPatch>) => void;
}) {
  const {
    selection,
    setAssetPatch,
    setDefaultValues,
    setIncludeComputedInTemplate,
    setRetainImage,
    setRetainText,
    setRuleName,
    setSideFieldLinks,
    setTemplateName,
    setValues,
  } = args;

  useEffect(() => {
    const nextValues = selection ? createPageStyleValuesFromPatch(selection.patch) : {};
    setDefaultValues(nextValues);
    setValues(nextValues);
    setAssetPatch(selection ? { assets: selection.patch.assets, declarations: [] } : emptyPatch());
    setTemplateName(selection ? createDefaultTemplateName() : '');
    setRuleName(createDefaultRuleName(selection));
    setSideFieldLinks({});
    setRetainText(false);
    setRetainImage(false);
    setIncludeComputedInTemplate(false);
  }, [
    selection,
    setAssetPatch,
    setDefaultValues,
    setIncludeComputedInTemplate,
    setRetainImage,
    setRetainText,
    setRuleName,
    setSideFieldLinks,
    setTemplateName,
    setValues,
  ]);
}

function emptyPatch(): PageStylePatch {
  return { assets: [], declarations: [] };
}

function createDraftState<
  Asset extends object,
  Flags extends object,
  Names extends object,
  Setters extends object,
  SideFields extends object,
  Values extends object,
>(args: {
  asset: Asset;
  flags: Flags;
  names: Names;
  setters: Setters;
  sideFields: SideFields;
  values: Values;
}): Asset & Flags & Names & Setters & SideFields & Values {
  return {
    ...args.asset,
    ...args.flags,
    ...args.names,
    ...args.setters,
    ...args.sideFields,
    ...args.values,
  };
}

function useDraftPatch(args: {
  assetPatch: PageStylePatch;
  defaultValues: ReturnType<typeof createPageStyleValuesFromPatch>;
  values: ReturnType<typeof createPageStyleValuesFromPatch>;
}) {
  const { assetPatch, defaultValues, values } = args;

  return useMemo<PageStylePatch>(() => {
    const valuePatch = createManualPageStylePatch({
      assets: assetPatch.assets,
      defaultValues,
      values,
    });
    return {
      assets: assetPatch.assets,
      declarations: mergeAssetDeclarations(valuePatch, assetPatch),
    };
  }, [assetPatch, defaultValues, values]);
}

function mergeAssetDeclarations(valuePatch: PageStylePatch, assetPatch: PageStylePatch) {
  return [
    ...valuePatch.declarations,
    ...assetPatch.declarations.filter(
      (assetDeclaration) =>
        !valuePatch.declarations.some(
          (valueDeclaration) => valueDeclaration.property === assetDeclaration.property
        )
    ),
  ];
}
