/* Design tokens and the style helpers the prototype built inline.

   Layout that has to react to the viewport lives in app/globals.css (inline
   styles cannot carry media queries). Everything that varies with data —
   status colour, game accent, progress width — stays here as inline style
   objects, which is how the prototype expressed it and keeps the values
   verifiable against the handoff. */

import type { CSSProperties } from 'react';
import { ST, type Status } from './domain';

export const C = {
  bg: '#0a0a0b',
  surface0: '#0d0d0f',
  surface1: '#0e0e11',
  surface2: '#101013',
  surface3: '#121214',
  surface4: '#16161a',
  surface5: '#1a1a1f',
  surface6: '#1c1c20',
  border: '#1d1d22',
  border2: '#26262c',
  text: '#ececf0',
  text2: '#c7ccd4',
  muted: '#8b8b95',
  faint: '#33333a',
  gold: '#d4af37',
  gold2: '#b8962f',
  goldHi: '#e8c95a',
  onGold: '#1a1505',
  green: '#3ecf8e',
  blue: '#5a9ded',
  amber: '#e0a534',
  red: '#e25555',
} as const;

/* next/font hashes the family name, so always go through the CSS variable
   set in app/layout.tsx. A bare "'Oswald'" would silently fall back. */
export const FONT_DISPLAY = "var(--font-oswald), 'Oswald', sans-serif";
export const FONT_UI = "var(--font-inter), 'Inter', sans-serif";

/** Rounded pill used for booster/date/paid chips. `rgb` is the bare triplet. */
export const chip = (color: string, rgb: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: `rgba(${rgb},.13)`,
  border: `1px solid rgba(${rgb},.32)`,
  borderRadius: 20,
  padding: '4px 11px',
  fontSize: 11,
  color,
  whiteSpace: 'nowrap',
});

/** Status pill — Oswald, uppercase, status colour at 13% fill / 30% border. */
export const statusPill = (k: Status): CSSProperties => ({
  fontFamily: FONT_DISPLAY,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '.5px',
  padding: '4px 12px',
  borderRadius: 20,
  textTransform: 'uppercase',
  background: `rgba(${ST[k].rgb},.13)`,
  color: ST[k].c,
  border: `1px solid rgba(${ST[k].rgb},.3)`,
  whiteSpace: 'nowrap',
  display: 'inline-block',
});

/** Square-ish game badge (VAL / MR / RL / OW2) tinted with the game accent. */
export const gameChip = (color: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'rgba(0,0,0,.35)',
  border: `1px solid ${color}55`,
  borderRadius: 6,
  padding: '3px 7px',
  fontFamily: FONT_DISPLAY,
  fontSize: 10,
  letterSpacing: '.6px',
  color,
  whiteSpace: 'nowrap',
});

export const cardStyle: CSSProperties = {
  background: 'linear-gradient(170deg,#121214,#16161a)',
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: 20,
};

export const innerCard: CSSProperties = {
  background: C.surface1,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 14,
};

export const label10: CSSProperties = {
  fontSize: 10,
  color: C.muted,
  textTransform: 'uppercase',
  letterSpacing: '1.2px',
};

export const label11: CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: C.muted,
  textTransform: 'uppercase',
  letterSpacing: '1px',
  marginBottom: 5,
};

export const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: C.surface0,
  border: `1px solid ${C.border2}`,
  borderRadius: 9,
  color: C.text,
  padding: '11px 12px',
  fontSize: 14,
  outline: 'none',
};

export const goldButton: CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '10px 16px',
  fontFamily: FONT_DISPLAY,
  fontWeight: 600,
  letterSpacing: '.8px',
  fontSize: 13,
  cursor: 'pointer',
  textTransform: 'uppercase',
  background: 'linear-gradient(160deg,#d4af37,#b8962f)',
  color: C.onGold,
};

export const ghostButton: CSSProperties = {
  background: C.surface6,
  border: `1px solid ${C.border2}`,
  borderRadius: 10,
  color: C.text,
  padding: '11px 14px',
  fontSize: 12.5,
  cursor: 'pointer',
};

/** Segmented-control tab. Active tabs get the gold wash. */
export const segTab = (on: boolean): CSSProperties => ({
  border: 'none',
  cursor: 'pointer',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 12.5,
  background: on ? '#1f1c14' : 'transparent',
  color: on ? C.gold : C.muted,
});

/** Status tab — same as segTab but Oswald/uppercase with the inset gold ring. */
export const statusTab = (on: boolean): CSSProperties => ({
  border: 'none',
  cursor: 'pointer',
  borderRadius: 8,
  padding: '8px 15px',
  fontFamily: FONT_DISPLAY,
  fontWeight: 500,
  letterSpacing: '.5px',
  fontSize: 13,
  textTransform: 'uppercase',
  ...(on
    ? { background: 'linear-gradient(160deg,#2a2419,#1f1c14)', color: C.gold, boxShadow: 'inset 0 0 0 1px rgba(212,175,55,.3)' }
    : { background: 'transparent', color: C.muted }),
});

export const pillGroup: CSSProperties = {
  display: 'flex',
  gap: 4,
  background: C.surface3,
  border: `1px solid ${C.border}`,
  padding: 5,
  borderRadius: 11,
  flexWrap: 'wrap',
};

/** Progress bar fill. `width` is a percentage 0-100. */
export const fillStyle = (pct: number, background: string): CSSProperties => ({
  height: '100%',
  width: `${pct}%`,
  background,
  borderRadius: 20,
});

export const trackStyle = (height: number, bordered = true): CSSProperties => ({
  height,
  background: C.surface0,
  borderRadius: 20,
  overflow: 'hidden',
  ...(bordered ? { border: `1px solid ${C.border}` } : null),
});

/** Timeline / alert dot. `glow` adds the box-shadow used on Needs Attention. */
export const dot = (color: string, size = 9, glow = false): CSSProperties => ({
  width: size,
  height: size,
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
  marginTop: size === 9 ? 4 : 0,
  ...(glow ? { boxShadow: `0 0 10px ${color}` } : null),
});

/** Coloured accent bar in front of a panel heading. */
export const headingBar = (color: string): CSSProperties => ({
  width: 4,
  height: 16,
  background: color,
  borderRadius: 2,
});

export const panelHeading: CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontSize: 14,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  marginBottom: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 9,
};

export const rowBetween: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12.5,
  padding: '3px 0',
  color: C.muted,
};

export const statValue: CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontSize: 14,
  color: C.text,
};
