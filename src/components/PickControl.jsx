export default function PickControl({ editable, selected, label, onPick, children }) {
  const style = { display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0, alignSelf: 'stretch', color: 'inherit', font: 'inherit', textAlign: 'left', background: 'transparent', border: 0, padding: 0 };
  return editable ? <button type="button" role="button" className="pick-control" style={style} aria-pressed={selected} aria-label={label} onClick={onPick}>{children}</button> : <span style={style}>{children}</span>;
}
