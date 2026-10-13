import { competitionTheme } from './brackets/competitionTheme';
export function BracketFrame({ children, onExit }) {
  return <div style={bracketFrameStyles.root} className="cbpr"><style>{CSS}</style>{onExit && <button type="button" className="bracket-close" style={bracketFrameStyles.exit} onClick={onExit} aria-label="Close bracket" title="Close bracket"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>}{children}</div>;
}

const CSS = `
.cbpr *{box-sizing:border-box}
.cbpr .bracket-close{background:transparent;color:var(--text);transition:background .15s,color .15s;box-shadow:none}
.cbpr .bracket-close:hover{background:var(--surface2);color:var(--text)}
.cbpr .bracket-close:focus-visible{outline:2px solid var(--color-focus);outline-offset:-4px}
.cbpr .bracket-close svg{display:block;flex-shrink:0;pointer-events:none}
.cbpr ::-webkit-scrollbar{width:11px;height:11px}
.cbpr ::-webkit-scrollbar-thumb{background:var(--color-control-line);border-radius:6px;border:3px solid transparent;background-clip:padding-box}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
`;
export const bracketFrameStyles = {
  root: { ...competitionTheme, position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 560, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-ui)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)' },
  exit: { position: 'absolute', top: 10, right: 12, zIndex: 30, width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: '50%', border: 'none', lineHeight: 1, cursor: 'pointer' },
  center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--muted)', fontSize: 14 },
  linkBtn: { color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  top: { minHeight: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 62px 12px 18px', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--line)', background: 'var(--surface)' },
  brand: { minWidth: 0, overflowWrap: 'anywhere', display: 'flex', flexDirection: 'column', lineHeight: 1.2 },
  title: { fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 1, color: 'var(--text)' },
  sub: { fontSize: 12, color: 'var(--muted)', marginTop: 3 },
  topRight: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  ghost: { minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 12px', cursor: 'pointer' },
  primary: { minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--color-on-brand)', background: 'var(--orange)', border: '1px solid var(--orange)', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' },
  primaryOff: { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--line)', cursor: 'not-allowed' },
  locked: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--teal)' },
  notice: { padding: '9px 18px', fontSize: 13, color: 'var(--muted)', background: 'var(--color-brand-soft)', borderBottom: '1px solid var(--line)' },
  scroll: { flex: 1, overflow: 'auto', position: 'relative' },
  svg: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  colHead: { position: 'absolute', top: 24, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 15, letterSpacing: 1.2, color: 'var(--muted)' },
  card: { position: 'absolute', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 9, boxShadow: 'var(--shadow-card)', userSelect: 'none' },
  tag: { fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: 1, color: 'var(--muted)', marginBottom: 6, height: 14 },
  vs: { fontSize: 10, color: 'var(--muted)', textAlign: 'center', margin: '3px 0', letterSpacing: 1 },
  slot: { display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 10px', borderRadius: 8, fontSize: 13, border: '1px solid transparent' },
  slotIdle: { background: 'var(--surface2)', border: '1px solid var(--line)' },
  slotPick: { background: 'var(--surface2)', border: '1px solid var(--color-control-line)' },
  slotWin: { background: 'var(--color-brand-soft)', border: '1px solid var(--color-brand)', color: 'var(--teal)', fontWeight: 600 },
  slotLose: { background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', opacity: 1 },
  slotPending: { background: 'var(--surface2)', border: '1px solid var(--line)', color: 'var(--muted)' },
  slotMuted: { background: 'var(--surface2)', color: 'var(--muted)' },
  name: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pend: { fontSize: 12 }, byeTxt: { fontStyle: 'italic' },
  toast: { position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--orange)', color: 'var(--color-on-brand)', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 10, boxShadow: 'var(--shadow-menu)', animation: 'pop .15s ease', zIndex: 20 },
};
