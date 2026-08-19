/* Marketplace paste parser.

   The regex set is kept from the prototype's parsePaste() — it is tuned to
   real Eldorado / GameBoost wording. Orders are entered by hand (neither
   marketplace exposes a usable API), so pasting the listing text and letting
   this fill the form IS the fast path; treat the patterns as data. */

import { EXTRAS, G, normalizeRegion, type GameKey } from './domain';

export interface ParsedOrder {
  game?: GameKey;
  from?: string;
  to?: string;
  cost?: string;
  cur?: '$' | '€' | '₺';
  riotId?: string;
  region?: string;
  startRR?: number;
  platform?: string;
  type?: 'rank' | 'netwin' | 'placement';
  count?: number;
  extras?: string[];
}

const RANK_RX = /(bronze|silver|gold|plat(?:inum)?|diamond|asc(?:endant)?|imm(?:ortal)?)\s*([1-3])/gi;

const normRank = (t: string, n: string) => {
  const k = t.toLowerCase();
  const base = k.startsWith('plat')
    ? 'Plat'
    : k.startsWith('asc')
      ? 'Ascendant'
      : k.startsWith('imm')
        ? 'Immortal'
        : k[0].toUpperCase() + k.slice(1);
  return `${base} ${n}`;
};

/** Human label for each detected field, shown on the green chips. */
export const FIELD_LABELS: Record<string, string> = {
  game: 'game', from: 'from', to: 'to', cost: 'price', cur: 'currency',
  riotId: 'account', region: 'region', startRR: 'RR', platform: 'marketplace',
  type: 'type', count: 'count', extras: 'extra',
};

export function parsePaste(text: string): ParsedOrder | null {
  const t = text ?? '';
  if (!t.trim()) return null;

  const out: ParsedOrder = {};

  out.game = /marvel|rivals/i.test(t)
    ? 'rivals'
    : /rocket\s?league|\brl\b/i.test(t)
      ? 'rl'
      : /overwatch|\bow2?\b/i.test(t)
        ? 'ow2'
        : 'valorant';

  // Longest ladder label wins at each position, so "Diamond 1" is not eaten
  // by a shorter overlapping match. Order of appearance decides from/to.
  const low = t.toLowerCase();
  const seen: Record<number, string> = {};
  G(out.game).ladder.forEach((r) => {
    const i = low.indexOf(r.toLowerCase());
    if (i < 0) return;
    if (!seen[i] || seen[i].length < r.length) seen[i] = r;
  });
  const rs = Object.keys(seen).map(Number).sort((a, b) => a - b).map((i) => seen[i]);

  // Valorant listings often write "g2 to d1" — fall back to the short form.
  if (!rs.length && out.game === 'valorant') {
    let m: RegExpExecArray | null;
    RANK_RX.lastIndex = 0;
    while ((m = RANK_RX.exec(t))) rs.push(normRank(m[1], m[2]));
  }
  if (rs.length) {
    out.from = rs[0];
    if (rs[1]) out.to = rs[1];
  }

  const money = t.match(/([$€₺]|usd|eur|try|tl)\s?([0-9]+(?:[.,][0-9]{1,2})?)|([0-9]+(?:[.,][0-9]{1,2})?)\s?([$€₺]|usd|eur|try|tl)/i);
  if (money) {
    const cur = (money[1] || money[4] || '').toLowerCase();
    out.cost = (money[2] || money[3] || '').replace(',', '.');
    out.cur = cur === '€' || cur === 'eur' ? '€' : cur === '₺' || cur === 'try' || cur === 'tl' ? '₺' : '$';
  }

  const rid = t.match(/([A-Za-z0-9 ._-]{3,16})#([A-Za-z0-9]{2,5})/);
  if (rid) {
    out.riotId = `${rid[1].trim()}#${rid[2]}`;
  } else {
    const nick = t.match(/(?:epic|steam|battletag|nick|hesap|kullanıcı(?:\s?adı)?|id)\s*[:=]?\s*([A-Za-z0-9._-]{3,20})/i);
    if (nick) out.riotId = nick[1];
  }

  const reg = t.match(/\b(TR|EU|EUW|EUNE|NA|AP|KR|BR|LATAM)\b/);
  if (reg) out.region = normalizeRegion(reg[1]);

  const rr = t.match(/(\d{1,2})\s?rr\b/i);
  if (rr) out.startRR = Number(rr[1]);

  if (/eldorado/i.test(t)) out.platform = 'Eldorado';
  if (/gameboost/i.test(t)) out.platform = 'GameBoost';

  if (/net\s?win/i.test(t)) out.type = 'netwin';
  else if (/placement/i.test(t)) out.type = 'placement';

  const cnt = t.match(/(\d{1,2})\s?(?:x|adet)?\s?(?:net\s?win|win|ma[çc]|game)/i);
  if (cnt) out.count = Number(cnt[1]);

  out.extras = EXTRAS.filter(([l]) => new RegExp(l.split(' ')[0], 'i').test(t)).map(([l]) => l);
  if (/duo/i.test(t) && !out.extras.includes('Duo Boost')) out.extras.push('Duo Boost');

  return Object.keys(out).length ? out : null;
}

/** Detected fields as `label: value` chips, skipping empties. */
export function parsedChips(p: ParsedOrder | null) {
  if (!p) return [];
  return (Object.keys(p) as (keyof ParsedOrder)[])
    .filter((k) => {
      const v = p[k];
      return v !== '' && v != null && !(Array.isArray(v) && !v.length);
    })
    .map((k) => {
      const v = p[k];
      const shown = k === 'game' ? G(v as string).label : Array.isArray(v) ? v.join(', ') : String(v);
      return { key: k as string, label: `${FIELD_LABELS[k] || k}: ${shown}` };
    });
}
