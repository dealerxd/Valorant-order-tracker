'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { C } from '@/lib/ui';

/** Errors surface as a single toast string in state, the way the prototype
    did — one message at a time, dismissed on click or after 6 s. */
export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onClose, 6000);
    return () => clearTimeout(id);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 200, maxWidth: 'min(520px, 92vw)',
        background: C.surface3, border: '1px solid rgba(226,85,85,.4)', borderRadius: 12,
        boxShadow: '0 18px 50px rgba(0,0,0,.6)', padding: '12px 14px',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        fontSize: 12.5, color: C.text, lineHeight: 1.45,
      }}
    >
      <span style={{ color: C.red, flexShrink: 0 }}>●</span>
      <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{message}</span>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', marginLeft: 'auto', padding: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
