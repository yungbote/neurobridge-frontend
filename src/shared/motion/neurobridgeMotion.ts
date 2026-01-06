import type { Transition } from "framer-motion";

export const NB_EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const NB_EASE_IN_OUT: [number, number, number, number] = [0.4, 0, 0.2, 1];

export const nbMotion = {
  transition: {
    type: "tween",
    ease: NB_EASE_OUT,
    duration: 0.15,
  } satisfies Transition,
  durations: {
    micro: 0.09,
    default: 0.15,
    panel: 0.2,
  },
} as const;
