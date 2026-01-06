import type { Transition, Variants } from "framer-motion";
import { NB_EASE_IN_OUT, NB_EASE_OUT, nbMotion } from "@/shared/motion/neurobridgeMotion";

export const nbTransitions = {
  micro: {
    type: "tween",
    ease: NB_EASE_OUT,
    duration: nbMotion.durations.micro,
  } satisfies Transition,
  default: {
    type: "tween",
    ease: NB_EASE_OUT,
    duration: nbMotion.durations.default,
  } satisfies Transition,
  dialogIn: {
    type: "tween",
    ease: NB_EASE_OUT,
    duration: 0.18,
  } satisfies Transition,
  dialogOut: {
    type: "tween",
    ease: NB_EASE_IN_OUT,
    duration: 0.14,
  } satisfies Transition,
  panel: {
    type: "tween",
    ease: NB_EASE_OUT,
    duration: nbMotion.durations.panel,
  } satisfies Transition,
  layout: {
    type: "tween",
    ease: NB_EASE_IN_OUT,
    duration: nbMotion.durations.default,
  } satisfies Transition,
} as const;

export const nbFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const nbFadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const nbPop: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 10, scale: 0.985 },
};

export const nbPanelRight: Variants = {
  initial: { opacity: 0, x: 18 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 18 },
};

export const nbPanelLeft: Variants = {
  initial: { opacity: 0, x: -18 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -18 },
};
