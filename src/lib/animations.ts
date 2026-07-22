import type { Variants, Transition } from "motion/react";

// Custom easing curves
type EasingTuple = [number, number, number, number];

export const easings: Record<string, EasingTuple> = {
  smooth: [0.16, 1, 0.3, 1],
  bouncy: [0.34, 1.56, 0.64, 1],
  snappy: [0.25, 0.1, 0.25, 1],
  gentle: [0.4, 0, 0.2, 1],
};

// Spring configs
export const springs = {
  soft: { type: "spring" as const, stiffness: 100, damping: 20 },
  medium: { type: "spring" as const, stiffness: 200, damping: 25 },
  stiff: { type: "spring" as const, stiffness: 300, damping: 30 },
  counter: { type: "spring" as const, stiffness: 50, damping: 15, mass: 0.5 },
};

// Fade animations — fast and subtle
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2, ease: easings.smooth },
  },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: easings.smooth },
  },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: easings.smooth },
  },
};

export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: easings.smooth },
  },
};

// Slide animations
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: easings.smooth },
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: easings.smooth },
  },
};

// Stagger container — nearly instant cascade
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: easings.smooth },
  },
};

// Glass hover effect
export const glassHover = {
  scale: 1.01,
  transition: { duration: 0.2, ease: easings.smooth },
};

export const glassActive = {
  scale: 0.99,
  transition: { duration: 0.15 },
};

// Page transition
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: easings.smooth },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.18, ease: easings.smooth },
  },
};

// Nav item animation
export const navItemVariants: Variants = {
  inactive: {
    backgroundColor: "rgba(255, 255, 255, 0)",
    transition: { duration: 0.2 },
  },
  active: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    transition: { duration: 0.2 },
  },
};

// Tooltip/dropdown appear
export const popoverVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: -2 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.18, ease: easings.smooth },
  },
};

// Shared transition presets
export const defaultTransition: Transition = {
  duration: 0.25,
  ease: easings.smooth,
};

export const slowTransition: Transition = {
  duration: 0.35,
  ease: easings.gentle,
};
