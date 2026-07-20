import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';

export function moveScenarioSlideByDirection(args: {
  direction: 'down' | 'up';
  slideId: string;
  slides: ScenarioSlide[];
}): ScenarioSlide[] {
  const fromIndex = args.slides.findIndex((slide) => slide.id === args.slideId);
  if (fromIndex < 0) {
    return args.slides;
  }

  const toIndex = args.direction === 'up' ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= args.slides.length) {
    return args.slides;
  }

  const nextSlides = args.slides.slice();
  const [slide] = nextSlides.splice(fromIndex, 1);
  if (!slide) {
    return args.slides;
  }

  nextSlides.splice(toIndex, 0, slide);
  return nextSlides;
}
