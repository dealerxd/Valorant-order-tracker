import { C } from '@/lib/ui';

/** Skeletons in the same card shapes the real content uses, so the layout
    does not jump when the data lands. */
export default function PanelLoading() {
  return (
    <div className="page-pad">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel" style={{ height: 108, borderRadius: 14, border: `1px solid ${C.border}` }} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18, marginTop: 22 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel" style={{ height: 260, borderRadius: 14, border: `1px solid ${C.border}` }} />
        ))}
      </div>
    </div>
  );
}
