'use client';

import { useOptimistic, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Download, GripVertical } from 'lucide-react';
import { setStatus, uploadScreenshot } from '@/lib/actions';
import { STATUSES, ST, type Status } from '@/lib/domain';
import { costTL, progress, routeOf, type Order } from '@/lib/model';
import { TL } from '@/lib/format';
import { C, FONT_DISPLAY, fillStyle, statusPill } from '@/lib/ui';
import { DoerChip, GameBadge } from './OrderBits';

/** Kanban board. Dropping a card on a column sets that status; dropping an
    image file on a card marks the job Done and stores the screenshot.

    Card drops and file drops share the same handlers, so file drops are
    separated by checking dataTransfer.types for 'Files' and stopping
    propagation before the column sees the event. */
export function OrderBoard({
  orders, onError,
}: {
  orders: Order[];
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [overCol, setOverCol] = useState<Status | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const uploading = useRef<Set<string>>(new Set());

  // Drag-and-drop is the one place the round trip is visible, so the move
  // paints immediately and reconciles when the action returns.
  const [view, moveOptimistic] = useOptimistic(
    orders,
    (state: Order[], move: { id: string; status: Status }) =>
      state.map((o) => (o.id === move.id ? { ...o, status: move.status } : o)),
  );

  const drop = (col: Status) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverCol(null);

    const id = dragId || e.dataTransfer.getData('text/plain');
    setDragId(null);
    if (!id) return;

    const current = view.find((o) => o.id === id);
    if (!current || current.status === col) return;

    start(async () => {
      moveOptimistic({ id, status: col });
      const res = await setStatus([id], col, `Status dragged to ${ST[col].label}`);
      if (!res.ok) onError(res.error ?? 'Could not move the job');
    });
  };

  const dropShot = (o: Order) => (e: React.DragEvent) => {
    const files = e.dataTransfer.files;
    if (!files || !files.length) return;
    e.preventDefault();
    e.stopPropagation();

    if (uploading.current.has(o.id)) return;
    uploading.current.add(o.id);

    const form = new FormData();
    form.append('file', files[0]);

    start(async () => {
      moveOptimistic({ id: o.id, status: 'tamam' });
      const res = await uploadScreenshot(o.id, form);
      uploading.current.delete(o.id);
      if (!res.ok) {
        onError(res.error ?? 'Upload failed');
        router.refresh();
      }
    });
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
        Drag a card onto a column to change its status. Dropping a finish screenshot on a card moves the job to{' '}
        <b style={{ color: C.green }}>Done</b>.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, alignItems: 'start' }}>
        {STATUSES.map((col) => {
          const cards = view.filter((o) => o.status === col);
          const over = overCol === col;
          return (
            <div
              key={col}
              className="board-col"
              onDragOver={(e) => { e.preventDefault(); if (overCol !== col) setOverCol(col); }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={drop(col)}
              style={{
                background: over ? 'rgba(212,175,55,.07)' : 'linear-gradient(170deg,#121214,#16161a)',
                border: `1px ${over ? 'dashed #b8962f' : `solid ${C.border}`}`,
                borderRadius: 14,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={statusPill(col)}>{ST[col].label}</span>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: 14, color: C.muted }}>{cards.length}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minHeight: 80 }}>
                {cards.map((o) => (
                  <BoardCard
                    key={o.id}
                    order={o}
                    dragging={dragId === o.id}
                    onDragStart={(e) => {
                      setDragId(o.id);
                      try {
                        e.dataTransfer.setData('text/plain', o.id);
                        e.dataTransfer.effectAllowed = 'move';
                      } catch { /* Safari during a file drag */ }
                    }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onShotOver={(e) => {
                      if (e.dataTransfer.types?.includes('Files')) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onShotDrop={dropShot(o)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({
  order: o, dragging, onDragStart, onDragEnd, onShotOver, onShotDrop,
}: {
  order: Order;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onShotOver: (e: React.DragEvent) => void;
  onShotDrop: (e: React.DragEvent) => void;
}) {
  const router = useRouter();
  const p = progress(o);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onShotOver}
      onDrop={onShotDrop}
      onClick={() => router.push(`/orders/${o.id}`, { scroll: false })}
      className={`board-card${dragging ? ' dragging' : ''}`}
      style={{
        background: C.surface1,
        border: `1px solid ${o.late ? 'rgba(226,85,85,.35)' : C.border}`,
        borderRadius: 12,
        padding: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <GripVertical size={13} style={{ color: C.faint, flexShrink: 0, marginTop: 1 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <GameBadge game={o.game} />
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 14.5, fontWeight: 600, letterSpacing: '.3px' }}>
              {routeOf(o)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
            {o.platform} · {o.type === 'rank' ? `${o.current}${o.tracked ? ` · ${o.currentRR} RR` : ''}` : `${o.count} matches`}
          </div>
        </div>
      </div>

      <div style={{ height: 5, background: C.bg, borderRadius: 20, overflow: 'hidden', margin: '11px 0 9px' }}>
        <div style={fillStyle(p, ST[o.status].c)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <DoerChip order={o} />
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 13, color: C.gold }}>{TL(costTL(o))}</span>
      </div>

      <div style={{
        marginTop: 10,
        border: `1px dashed ${o.shot ? 'rgba(62,207,142,.4)' : C.border2}`,
        borderRadius: 8, padding: 7, textAlign: 'center', fontSize: 10.5,
        color: o.shot ? C.green : C.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      }}>
        {o.shot
          ? <><Check size={11} /> {o.shot}</>
          : <><Download size={11} /> drop finish screenshot here</>}
      </div>
    </div>
  );
}
