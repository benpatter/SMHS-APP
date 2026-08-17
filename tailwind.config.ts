import type { Config } from 'tailwindcss';

/**
 * The single source of truth for the SMCHS brand, mirrored from the official
 * 2017 Brand Guidelines. No red anywhere in the palette — royal blue + vegas
 * gold on a white/gray neutral system is the whole identity. `red` is exposed
 * ONLY as a semantic error/destructive token, never as a brand accent.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        royal: {
          DEFAULT: '#1A4784', // Pantone 287 — dominant brand color
          50: '#eef3f9',
          100: '#d3e0ef',
          700: '#163c6f',
          800: '#11305a',
          900: '#0c2240',
        },
        gold: {
          DEFAULT: '#B4A365', // Pantone 4515 — muted antique accent
          soft: '#d8cda3',
          deep: '#8f8049',
          // Same hue, taken dark enough for small text on a gold tint (AA).
          ink: '#5c5230',
        },
        // Theme-aware royal for TEXT. `royal` is a fixed ink that stays legible
        // on light surfaces but disappears on dark ones; `brand` follows the
        // --royal variable, which lifts in dark mode. Backgrounds keep `royal`
        // so white-on-royal buttons hold their contrast in both themes.
        brand: 'var(--royal)',
        anthracite: '#282828',
        lightgray: '#999999',
        // Semantic-only. Never a brand accent. Variable-backed so it lifts on
        // dark surfaces; the channel syntax keeps /opacity modifiers working.
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        // Classical serif caps for the institutional wordmark / major titles.
        display: ['var(--font-display)', 'Cinzel', 'Georgia', 'serif'],
        // Plain, legible sans for dense utilitarian UI.
        sans: [
          'var(--font-sans)',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        // Square-ish corners, not friendly rounded-2xl everywhere.
        card: '4px',
      },
    },
  },
  plugins: [],
};

export default config;
