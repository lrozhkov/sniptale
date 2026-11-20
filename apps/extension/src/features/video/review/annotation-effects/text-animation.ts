import type { ReviewAnnotationTextClip, ReviewTextLoop, ReviewTextTransition } from './types';

const ease = (progress: number) => 1 - (1 - progress) ** 3;
const clamp = (progress: number) => Math.max(0, Math.min(1, progress));

/** The caller supplies the localized starter text and a result-time interval. */
export function createReviewAnnotationTextClip(
  id: string,
  text: string,
  start: number,
  end: number,
  order: number
): ReviewAnnotationTextClip {
  const transition: ReviewTextTransition = {
    preset: 'none',
    duration: 0.35,
    direction: 'up',
    distance: 0.15,
    stagger: 0.6,
  };
  return {
    id,
    enabled: true,
    text,
    start,
    end,
    order,
    transform: { x: 0.15, y: 0.38, width: 0.7, height: 0.24, rotation: 0 },
    color: '#ffffff',
    fontSize: 0.075,
    entrance: { ...transition },
    loop: { preset: 'none', period: 1.6, amount: 0.35 },
    exit: { ...transition },
  };
}

/** Visual values use fractions of the text box or the font size. */
interface TextMotion {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  tracking: number;
  blur: number;
  wipe: number;
  shine: number;
  shinePosition: number;
}

const STILL: Readonly<TextMotion> = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  tracking: 0,
  blur: 0,
  wipe: 1,
  shine: 0,
  shinePosition: 0,
};

/** A reveal specifies the layout unit whose position stays fixed during the effect. */
export function reviewTextRevealUnit(phase: ReviewTextTransition): 'word' | 'grapheme' | null {
  if (phase.preset === 'words' || phase.preset === 'cascade') return 'word';
  if (phase.preset === 'letters' || phase.preset === 'typewriter') return 'grapheme';
  return null;
}

function transitionMotion(phase: ReviewTextTransition, progress: number): Readonly<TextMotion> {
  const remaining = 1 - ease(progress);
  switch (phase.preset) {
    case 'fade':
      return { ...STILL, opacity: progress };
    case 'slide': {
      const distance = remaining * phase.distance;
      return {
        ...STILL,
        x: phase.direction === 'left' ? distance : phase.direction === 'right' ? -distance : 0,
        y: phase.direction === 'up' ? distance : phase.direction === 'down' ? -distance : 0,
        opacity: ease(progress),
      };
    }
    case 'pop': {
      const scale = 1 + remaining * (0.3 - 0.9 * remaining);
      return { ...STILL, scaleX: scale, scaleY: scale, opacity: ease(progress) };
    }
    case 'zoom':
      return {
        ...STILL,
        scaleX: 1 + remaining * 0.55,
        scaleY: 1 + remaining * 0.55,
        opacity: ease(progress),
      };
    case 'bounce':
      return {
        ...STILL,
        y: -Math.abs(Math.cos(progress * Math.PI * 2.5)) * remaining * phase.distance,
        opacity: ease(progress),
      };
    case 'wipe':
      return { ...STILL, wipe: ease(progress) };
    case 'tracking':
      return { ...STILL, tracking: remaining * phase.distance * 3, opacity: ease(progress) };
    case 'blur':
      return { ...STILL, blur: remaining * phase.distance, opacity: ease(progress) };
    case 'rise':
      return { ...STILL, y: remaining * phase.distance, wipe: ease(progress) };
    case 'squeeze':
      return { ...STILL, scaleX: 1 - remaining * 0.9, opacity: ease(progress) };
    case 'none':
    case 'words':
    case 'letters':
    case 'typewriter':
    case 'cascade':
      return STILL;
  }
}

function loopMotion(loop: ReviewTextLoop, elapsed: number): Readonly<TextMotion> {
  const cycle = (elapsed % loop.period) / loop.period;
  const angle = cycle * Math.PI * 2;
  const wave = Math.sin(angle) * loop.amount;
  const rise = (1 - Math.cos(angle)) * 0.5 * loop.amount;
  switch (loop.preset) {
    case 'shine':
      return { ...STILL, shine: Math.sin(cycle * Math.PI) * loop.amount, shinePosition: cycle };
    case 'pulse':
      return { ...STILL, scaleX: 1 + rise * 0.2, scaleY: 1 + rise * 0.2 };
    case 'sway':
      return { ...STILL, x: wave * 0.08, rotation: wave * 0.2 };
    case 'float':
      return { ...STILL, y: -rise * 0.25 };
    case 'breathe':
      return {
        ...STILL,
        opacity: 1 - rise * 0.45,
        scaleX: 1 + rise * 0.07,
        scaleY: 1 + rise * 0.07,
      };
    case 'flicker':
      return {
        ...STILL,
        opacity: 1 - Math.abs(Math.sin(angle * 3) * Math.sin(angle * 2)) * loop.amount * 0.65,
      };
    case 'none':
      return STILL;
  }
}

/** Samples authored phases against the complete result timeline, including truncated exports. */
export function sampleReviewAnnotationText(clip: ReviewAnnotationTextClip, time: number) {
  if (!clip.enabled || !(time >= clip.start && time < clip.end)) return null;
  const duration = clip.end - clip.start;
  const desiredEntrance = clip.entrance.preset === 'none' ? 0 : clip.entrance.duration;
  const desiredExit = clip.exit.preset === 'none' ? 0 : clip.exit.duration;
  const needsReadTime = desiredEntrance > 0 && reviewTextRevealUnit(clip.entrance) !== null;
  const minimumHold = needsReadTime ? Math.min(0.18, duration * 0.2) : 0;
  const scale = Math.min(1, (duration - minimumHold) / (desiredEntrance + desiredExit));
  const enterDuration = desiredEntrance * scale;
  const exitDuration = desiredExit * scale;
  const holdDuration = Math.max(minimumHold, duration - enterDuration - exitDuration);
  const exitStart = duration - exitDuration;
  const elapsed = time - clip.start;

  if (elapsed < enterDuration) {
    const progress = clamp(elapsed / enterDuration);
    return {
      motion: transitionMotion(clip.entrance, progress),
      reveal: { transition: clip.entrance, progress, reverse: false },
    };
  }
  if (exitDuration > 0 && elapsed >= exitStart) {
    const progress = clamp((elapsed - exitStart) / exitDuration);
    const loop = loopMotion(clip.loop, holdDuration);
    const motion = transitionMotion(clip.exit, 1 - progress);
    return {
      motion: {
        ...motion,
        x: motion.x + loop.x * (1 - progress),
        y: motion.y + loop.y * (1 - progress),
        rotation: loop.rotation * (1 - progress),
        scaleX: motion.scaleX * (1 + (loop.scaleX - 1) * (1 - progress)),
        scaleY: motion.scaleY * (1 + (loop.scaleY - 1) * (1 - progress)),
        opacity: motion.opacity * (1 + (loop.opacity - 1) * (1 - progress)),
        shine: loop.shine * (1 - progress),
        shinePosition: loop.shinePosition,
      },
      reveal: { transition: clip.exit, progress: 1 - progress, reverse: true },
    };
  }
  return { motion: loopMotion(clip.loop, Math.max(0, elapsed - enterDuration)), reveal: null };
}

/** Sample one layout unit once the entire text has been measured. */
export function sampleReviewTextReveal(
  reveal: NonNullable<NonNullable<ReturnType<typeof sampleReviewAnnotationText>>['reveal']>,
  index: number,
  count: number
) {
  const { transition, progress, reverse } = reveal;
  const position = reverse ? count - index - 1 : index;
  if (transition.preset === 'typewriter')
    return { opacity: Number(position < Math.floor(progress * count)), y: 0, blur: 0 };
  const stagger = transition.stagger * 0.95;
  const offset = count > 1 ? (stagger * position) / (count - 1) : 0;
  const local = ease(clamp((progress - offset) / (1 - stagger)));
  const cascade = transition.preset === 'cascade';
  return {
    opacity: local,
    y: cascade ? (1 - local) * transition.distance : 0,
    blur: cascade ? (1 - local) * transition.distance * 0.4 : 0,
  };
}
