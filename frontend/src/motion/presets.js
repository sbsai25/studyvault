// Shared animation presets for Motion components. Durations are in seconds
// and mirror the CSS motion tokens in styles/tokens.css. With reduced motion,
// MotionConfig turns transform animations off and keeps only opacity.

export const EASE_OUT = [0.22, 1, 0.36, 1];
export const EASE_IN = [0.4, 0, 1, 1];

export const DURATION = {
  fast: 0.18,
  base: 0.26,
  slow: 0.4,
};

// Page sections and cards: a short fade with an 8px rise
export const fadeRise = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base + 0.04, ease: EASE_OUT } },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE_IN } },
};

// Parent variant that staggers its children. Keep the stagger small so long
// lists never feel slow; children beyond the first few appear together.
export function stagger(staggerChildren = 0.05, delayChildren = 0) {
  return {
    hidden: {},
    show: { transition: { staggerChildren, delayChildren } },
  };
}

// Dialogs and popovers
export const scaleIn = {
  hidden: { opacity: 0, scale: 0.97, y: 6 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: DURATION.fast, ease: EASE_IN } },
};

export const overlay = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE_IN } },
};

// Mobile navigation drawer, sliding in from the left
export const sheetLeft = {
  hidden: { x: '-100%' },
  show: { x: 0, transition: { duration: 0.32, ease: EASE_OUT } },
  exit: { x: '-100%', transition: { duration: 0.22, ease: EASE_IN } },
};

export const toastMotion = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE_IN } },
};

// New chat messages and other small items appearing in a list
export const itemIn = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE_IN } },
};
