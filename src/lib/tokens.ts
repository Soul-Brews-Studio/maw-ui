// Design tokens shared across studio + vector + canvas.
// Keep this file small — only tokens that multiple apps consume.

export const LAYOUT = {
  /** Default max-width for page containers (px). */
  maxWidth: '1300px',
  /** Max-width for the full-bleed header row (px). */
  headerMaxWidth: '1400px',
  /** Default horizontal padding (Tailwind scale). */
  px: 6,
  /** Default vertical padding (Tailwind scale). */
  py: 6,
} as const;

export const CHIP_COLORS = {
  checking: {
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.3)',
    dot: '#94a3b8',
  },
  live: {
    bg: 'rgba(74, 222, 128, 0.12)',
    border: 'rgba(74, 222, 128, 0.4)',
    dot: '#4ade80',
  },
  demo: {
    bg: 'rgba(251, 191, 36, 0.12)',
    border: 'rgba(251, 191, 36, 0.4)',
    dot: '#fbbf24',
  },
} as const;
