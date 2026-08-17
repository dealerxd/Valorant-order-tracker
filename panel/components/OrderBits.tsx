'use client';

import { G, ST } from '@/lib/domain';
import { doerOf, isExternal, progress, type Order } from '@/lib/model';
import { C, chip, fillStyle, gameChip, statusPill, trackStyle } from '@/lib/ui';

/* The small pieces the table, cards, board and drawer all repeat. */

export function GameBadge({ game }: { game: Order['game'] }) {
  const g = G(game);
  return <span style={gameChip(g.color)}>{g.short}</span>;
}

export function StatusPill({ status }: { status: Order['status'] }) {
  return <span style={statusPill(status)}>{ST[status].label}</span>;
}

/** Blue for our booster, grey for an outsourced seller, amber when nobody
    has picked the job up yet. */
export function DoerChip({ order }: { order: Order }) {
  const style = isExternal(order)
    ? chip(C.text2, '199,204,212')
    : order.booster
      ? chip(C.blue, '90,157,237')
      : chip(C.amber, '224,165,52');
  return <span style={style}>{doerOf(order)}</span>;
}

export function ProgressBar({ order, height = 6 }: { order: Order; height?: number }) {
  const p = progress(order);
  const to = order.status === 'tamam' ? C.green : C.gold;
  return (
    <div style={trackStyle(height)}>
      <div style={fillStyle(p, `linear-gradient(90deg,${ST[order.status].c},${to})`)} />
    </div>
  );
}

export function PaidChip({ order }: { order: Order }) {
  const ext = isExternal(order);
  const paid = ext ? order.vpaid : order.paid;
  const label = ext ? (paid ? '✓ seller paid' : '● seller unpaid') : paid ? '✓ paid' : '● unpaid';
  return <span style={paid ? chip(C.green, '62,207,142') : chip(C.red, '226,85,85')}>{label}</span>;
}

/** Paid/unpaid as a bare line under the payout figure in the table. */
export function PaidLine({ order }: { order: Order }) {
  const ext = isExternal(order);
  const paid = ext ? order.vpaid : order.paid;
  const label = ext ? (paid ? '✓ seller paid' : '● seller unpaid') : paid ? '✓ paid' : '● unpaid';
  return (
    <div style={{ fontSize: 10.5, marginTop: 3, color: paid ? C.green : C.red }}>{label}</div>
  );
}
