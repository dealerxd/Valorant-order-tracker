'use client';

import { useState, useTransition } from 'react';
import { Check, Clipboard, Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';
import { clearCredentials, saveCredentials } from '@/lib/actions';
import { C, FONT_DISPLAY, ghostButton, inputStyle, label10 } from '@/lib/ui';

export interface CredentialsData {
  login: string;
  password: string;
  note: string;
  updatedAt: string | null;
}

/** Siparişteki oyun hesabının giriş bilgileri.

    Şifre varsayılan olarak gizli. Bu bir şifreleme değil — veri sunucudan
    düz metin geliyor ve RLS onu zaten yalnızca yetkili kişiye veriyor. Amaç
    daha basit: drawer açıkken omuz üstünden okunmasın, ekran paylaşımında
    kazara görünmesin. Kopyala düğmesi şifreyi hiç göstermeden kullanmayı
    mümkün kıldığı için asıl yol odur. */
export function CredentialsCard({
  orderId, initial, canEdit, onError,
}: {
  orderId: string;
  initial: CredentialsData | null;
  canEdit: boolean;
  onError: (msg: string) => void;
}) {
  const [cred, setCred] = useState<CredentialsData>(
    initial ?? { login: '', password: '', note: '', updatedAt: null },
  );
  const [shown, setShown] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const has = !!(cred.login || cred.password);

  const copy = async (what: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      onError('Panoya kopyalanamadı');
    }
  };

  const save = () => start(async () => {
    const res = await saveCredentials(orderId, cred);
    if (!res.ok) { onError(res.error ?? 'Kaydedilemedi'); return; }
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  });

  const wipe = () => start(async () => {
    const res = await clearCredentials(orderId);
    if (!res.ok) { onError(res.error ?? 'Silinemedi'); return; }
    setCred({ login: '', password: '', note: '', updatedAt: null });
    setShown(false);
    setEditing(false);
  });

  return (
    <div style={{
      background: C.surface1, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 14, marginTop: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ ...label10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <KeyRound size={12} /> Hesap bilgileri
        </div>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="hover-gold"
            style={{ ...ghostButton, padding: '5px 10px', fontSize: 11.5 }}
          >
            {has ? 'Düzenle' : 'Ekle'}
          </button>
        )}
      </div>

      {!editing && !has && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Henüz girilmedi.</div>
      )}

      {!editing && has && (
        <>
          <Field
            label="kullanıcı"
            value={cred.login}
            copied={copied === 'login'}
            onCopy={() => copy('login', cred.login)}
          />
          <Field
            label="şifre"
            mono
            value={shown ? cred.password : '•'.repeat(Math.max(8, cred.password.length))}
            copied={copied === 'pw'}
            onCopy={() => copy('pw', cred.password)}
            extra={
              <button
                onClick={() => setShown((v) => !v)}
                aria-label={shown ? 'Şifreyi gizle' : 'Şifreyi göster'}
                className="hover-gold"
                style={{
                  background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 7,
                  color: C.muted, padding: '5px 8px', cursor: 'pointer', display: 'inline-flex',
                }}
              >
                {shown ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            }
          />
          {cred.note && (
            <div style={{ fontSize: 11.5, color: C.text2, marginTop: 8, lineHeight: 1.5 }}>
              {cred.note}
            </div>
          )}
          {saved && <div style={{ fontSize: 11, color: C.green, marginTop: 8 }}>✓ kaydedildi</div>}
        </>
      )}

      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <input
            value={cred.login}
            onChange={(e) => setCred((c) => ({ ...c, login: e.target.value }))}
            placeholder="kullanıcı adı / e-posta"
            autoComplete="off"
            style={{ ...inputStyle, fontSize: 13 }}
          />
          <input
            value={cred.password}
            onChange={(e) => setCred((c) => ({ ...c, password: e.target.value }))}
            placeholder="şifre"
            autoComplete="off"
            style={{ ...inputStyle, fontSize: 13 }}
          />
          <textarea
            value={cred.note}
            onChange={(e) => setCred((c) => ({ ...c, note: e.target.value }))}
            placeholder="2FA, e-posta erişimi, ek not…"
            style={{ ...inputStyle, fontSize: 12.5, minHeight: 54, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={save}
              disabled={pending}
              style={{
                border: 'none', borderRadius: 9, padding: '9px 14px', cursor: 'pointer',
                fontFamily: FONT_DISPLAY, fontSize: 12.5, textTransform: 'uppercase',
                background: 'linear-gradient(160deg,#d4af37,#b8962f)', color: C.onGold,
              }}
            >
              Kaydet
            </button>
            <button onClick={() => setEditing(false)} style={{ ...ghostButton, padding: '9px 12px' }}>
              Vazgeç
            </button>
            {has && (
              <button
                onClick={wipe}
                disabled={pending}
                style={{
                  ...ghostButton, padding: '9px 12px', marginLeft: 'auto',
                  borderColor: 'rgba(226,85,85,.35)', color: C.red,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <Trash2 size={12} /> Sil
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onCopy, copied, mono, extra,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  mono?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
        <code style={{
          flex: 1, minWidth: 0, fontFamily: mono ? 'ui-monospace,monospace' : 'inherit',
          fontSize: 12.5, color: C.text, background: C.surface0,
          border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 9px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {value}
        </code>
        {extra}
        <button
          onClick={onCopy}
          aria-label={`${label} kopyala`}
          className="hover-gold"
          style={{
            background: 'transparent', border: `1px solid ${C.border2}`, borderRadius: 7,
            color: copied ? C.green : C.muted, padding: '5px 8px', cursor: 'pointer',
            display: 'inline-flex',
          }}
        >
          {copied ? <Check size={12} /> : <Clipboard size={12} />}
        </button>
      </div>
    </div>
  );
}
