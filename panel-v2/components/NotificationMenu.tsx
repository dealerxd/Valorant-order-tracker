'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, TriangleAlert, User, Wallet, ClipboardList } from 'lucide-react';
import type { Notif } from '@/lib/orders';
import { C, FONT_DISPLAY } from '@/lib/ui';

const ICONS = {
  late: TriangleAlert,
  unassigned: User,
  payment: Wallet,
  finance: ClipboardList,
} as const;

/** Read state is per-browser: these are derived alerts, not stored rows, so
    there is nothing on the server to mark. */
const STORAGE_KEY = 'resellbot.notifs.read';

export function NotificationMenu({ notifs }: { notifs: Notif[] }) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setRead(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    } catch {
      setRead([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = notifs.filter((n) => n.unread && !read.includes(n.id));

  const markAll = () => {
    const ids = notifs.map((n) => n.id);
    setRead(ids);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch { /* private mode */ }
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications (${unread.length} unread)`}
        aria-expanded={open}
        className="hover-border"
        style={{
          position: 'relative', background: C.surface3, border: `1px solid ${C.border2}`,
          borderRadius: 10, color: C.text2, padding: '9px 12px', fontSize: 14, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center',
        }}
      >
        <Bell size={15} />
        {unread.length > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5, background: C.red, color: '#fff',
            fontSize: 10, fontFamily: FONT_DISPLAY, borderRadius: 20, padding: '1px 5px',
            minWidth: 16, textAlign: 'center',
          }}>
            {unread.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 52, right: 0, width: 330, maxWidth: '86vw',
          background: C.surface3, border: `1px solid ${C.border2}`, borderRadius: 14,
          boxShadow: '0 18px 50px rgba(0,0,0,.6)', padding: 14, zIndex: 60,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, letterSpacing: '1px', textTransform: 'uppercase' }}>
              Notifications
            </div>
            <button
              onClick={markAll}
              style={{ background: 'transparent', border: 'none', color: C.blue, fontSize: 11, cursor: 'pointer' }}
            >
              mark all read
            </button>
          </div>

          <div className="scroll-y" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320 }}>
            {notifs.length === 0 && (
              <div style={{ fontSize: 12.5, color: C.muted, padding: '8px 2px' }}>Nothing needs attention.</div>
            )}
            {notifs.map((n) => {
              const isUnread = n.unread && !read.includes(n.id);
              const Icon = ICONS[n.icon];
              return (
                <div
                  key={n.id}
                  style={{
                    borderRadius: 10, padding: '11px 12px',
                    background: isUnread ? 'rgba(212,175,55,.06)' : 'transparent',
                    border: `1px solid ${isUnread ? 'rgba(212,175,55,.22)' : C.border}`,
                  }}
                >
                  <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <Icon size={13} style={{ marginTop: 2, flexShrink: 0, color: C.muted }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>{n.text}</div>
                      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>{n.time}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
