'use client';

import { useState } from 'react';
import type { Order } from '@/lib/model';
import { BulkBar } from './BulkBar';
import { OrderBoard } from './OrderBoard';
import { OrderCards } from './OrderCards';
import { OrderTable } from './OrderTable';
import { Toast } from './Toast';

export type ViewMode = 'table' | 'cards' | 'board';

/** Owns the client-only state the Orders screen needs: row selection, the
    error toast, and (inside the board) drag state. Everything else —
    section, view mode, filters, search — is URL state handled by the page. */
export function OrdersView({
  orders, view, boosters, isAdmin,
}: {
  orders: Order[];
  view: ViewMode;
  boosters: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const toggleAll = (checked: boolean) => setSelected(checked ? orders.map((o) => o.id) : []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {selected.length > 0 && (
        <BulkBar
          selected={selected}
          orders={orders}
          boosters={boosters}
          isAdmin={isAdmin}
          onClear={() => setSelected([])}
          onError={setError}
        />
      )}

      {view === 'board' ? (
        <OrderBoard orders={orders} onError={setError} />
      ) : view === 'cards' ? (
        <OrderCards orders={orders} isAdmin={isAdmin} forceVisible />
      ) : (
        <>
          {/* Below 760px the table hides and the cards take over — see the
              .only-wide / .only-narrow rules in globals.css. */}
          <OrderTable
            orders={orders}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            isAdmin={isAdmin}
          />
          <OrderCards orders={orders} isAdmin={isAdmin} />
        </>
      )}

      <Toast message={error} onClose={() => setError('')} />
    </div>
  );
}
