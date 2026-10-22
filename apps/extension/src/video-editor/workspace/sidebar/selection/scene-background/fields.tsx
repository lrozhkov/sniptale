import { NumericRow } from '../../../../../ui/compact-inspector-controls';
import { useEffect, useState } from 'react';
import { BackgroundImagePicker } from '../../../../../composition/background-resources/picker';
import { resolveSceneBackgroundKind } from '../../../../../features/video/project/scene/background-settings';
import { translate } from '../../../../../platform/i18n';
import { VideoSceneBackgroundKind } from '../../../../../features/video/project/types';
import { SelectInput } from '../shared/controls';
import { OptionButtonsField } from '../shared/option-buttons';
import { PANEL_META_CLASS_NAME } from '../shared/panel';
import { SceneBackgroundColorEditor } from './colors';
import type { SceneBackground, SceneBackgroundFieldProps } from './shared';

export function SceneBackgroundFields(props: SceneBackgroundFieldProps) {
  const [imageRequested, setImageRequested] = useState(false);
  useEffect(() => {
    if (props.sceneBackground.kind === VideoSceneBackgroundKind.IMAGE) setImageRequested(false);
  }, [props.sceneBackground.kind]);
  const blur = props.sceneBackground.blur ?? 0;
  return (
    <div className="sniptale-parameter-stack grid gap-3" data-ui="video-editor.scene-background">
      <OptionButtonsField
        label={translate('videoEditor.sidebar.sceneBackgroundTypeLabel')}
        value={
          imageRequested
            ? VideoSceneBackgroundKind.IMAGE
            : props.sceneBackground.enabled === false
              ? 'none'
              : props.sceneBackground.kind
        }
        onChange={(value) => {
          setImageRequested(
            value === VideoSceneBackgroundKind.IMAGE && props.imageAssets.length === 0
          );
          handleSceneBackgroundKindChange(value, props);
        }}
        options={getSceneBackgroundKindOptions(props.imageAssets)}
      />
      {(imageRequested || props.sceneBackground.enabled !== false) &&
        (imageRequested || props.sceneBackground.kind === VideoSceneBackgroundKind.IMAGE ? (
          <ImageBackgroundEditor {...props} />
        ) : (
          <SceneBackgroundEditor {...props} />
        ))}
      {props.sceneBackground.enabled !== false &&
        !imageRequested &&
        props.sceneBackground.kind !== VideoSceneBackgroundKind.SOLID && (
          <NumericRow
            label={translate('editor.scene.backgroundBlurAmount')}
            value={blur}
            min={0}
            max={25}
            step={1}
            precision={2}
            unit="px"
            normalizeValue={(value) => (value === Number(blur.toFixed(2)) ? blur : value)}
            onPreviewValue={() => undefined}
            onCommitValue={(value) => {
              props.onSetSceneBackground({ blur: value });
              props.onResetSceneBackgroundPreview();
            }}
          />
        )}
    </div>
  );
}

function SceneBackgroundEditor(props: SceneBackgroundFieldProps) {
  switch (props.sceneBackground.kind) {
    case VideoSceneBackgroundKind.SOLID:
      return <SceneBackgroundColorEditor {...props} />;
    case VideoSceneBackgroundKind.GRADIENT:
      return <SceneBackgroundColorEditor {...props} />;
    case VideoSceneBackgroundKind.IMAGE:
      return <ImageBackgroundEditor {...props} />;
  }
}

function ImageBackgroundEditor(props: SceneBackgroundFieldProps) {
  return (
    <div className="sniptale-parameter-stack grid gap-3">
      {props.imageAssets.length > 0 && (
        <SelectInput
          label={translate('videoEditor.sidebar.sceneBackgroundImageAssetLabel')}
          value={
            props.sceneBackground.kind === VideoSceneBackgroundKind.IMAGE
              ? props.sceneBackground.assetId
              : ''
          }
          onChange={(value) => commitSceneBackgroundImage(value, props)}
          options={getSceneBackgroundAssetOptions(props.imageAssets)}
        />
      )}
      {props.sceneBackground.kind === VideoSceneBackgroundKind.IMAGE && (
        <OptionButtonsField
          label={translate('videoEditor.sidebar.sceneBackgroundImageFit')}
          value={props.sceneBackground.imageFit ?? 'cover'}
          options={[
            { value: 'cover', label: translate('videoEditor.sidebar.sceneBackgroundImageCover') },
            {
              value: 'contain',
              label: translate('videoEditor.sidebar.sceneBackgroundImageContain'),
            },
          ]}
          onChange={(imageFit) => {
            if (props.sceneBackground.kind !== VideoSceneBackgroundKind.IMAGE) return;
            props.onSetSceneBackground({ ...props.sceneBackground, imageFit });
            props.onResetSceneBackgroundPreview();
          }}
        />
      )}
      {props.onImportImage && (
        <BackgroundImagePicker
          onSelect={({ file, originMediaId }) =>
            props.onImportImage?.(file, {
              destination: 'background',
              ...(originMediaId ? { backgroundOriginMediaId: originMediaId } : {}),
            })
          }
        />
      )}
      {props.imageAssets.length === 0 && (
        <p className={PANEL_META_CLASS_NAME}>
          {translate('videoEditor.sidebar.sceneBackgroundImageEmpty')}
        </p>
      )}
    </div>
  );
}

function handleSceneBackgroundKindChange(
  nextKind: SceneBackground['kind'] | 'none',
  props: SceneBackgroundFieldProps
) {
  if (nextKind === 'none') {
    props.onSetSceneBackground({ ...props.sceneBackground, enabled: false });
    props.onResetSceneBackgroundPreview();
    return;
  }
  const next = resolveSceneBackgroundKind(
    props.sceneBackground,
    nextKind,
    props.imageAssets[0]?.id
  );
  if (!next) return;
  props.onSetSceneBackground(next);
  props.onResetSceneBackgroundPreview();
}

function commitSceneBackgroundImage(
  assetId: string,
  props: Pick<
    SceneBackgroundFieldProps,
    'onResetSceneBackgroundPreview' | 'onSetSceneBackground' | 'sceneBackground'
  >
) {
  props.onSetSceneBackground({
    kind: VideoSceneBackgroundKind.IMAGE,
    assetId,
    ...(props.sceneBackground.kind === VideoSceneBackgroundKind.IMAGE &&
    props.sceneBackground.imageFit !== undefined
      ? { imageFit: props.sceneBackground.imageFit }
      : {}),
  });
  props.onResetSceneBackgroundPreview();
}

export function getSceneBackgroundKindOptions(
  _imageAssets: SceneBackgroundFieldProps['imageAssets'] = []
) {
  return [
    { value: 'none' as const, label: translate('gallery.videoReview.backgroundNone') },
    {
      value: VideoSceneBackgroundKind.SOLID,
      label: translate('videoEditor.sidebar.sceneBackgroundSolid'),
    },
    {
      value: VideoSceneBackgroundKind.GRADIENT,
      label: translate('videoEditor.sidebar.sceneBackgroundGradient'),
    },
    {
      value: VideoSceneBackgroundKind.IMAGE,
      label: translate('videoEditor.sidebar.sceneBackgroundImage'),
      disabled: false,
    },
  ];
}

export function getSceneBackgroundAssetOptions(
  imageAssets: SceneBackgroundFieldProps['imageAssets']
) {
  return imageAssets.map((asset) => ({
    value: asset.id,
    label: asset.name,
  }));
}
