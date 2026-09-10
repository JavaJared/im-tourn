import { S, CSS } from './poolStyles';
export default function Shell({ children, onBack }) {
  return <div style={S.root} className="cbpd"><style>{CSS}</style>{onBack && <button style={S.exit} onClick={onBack} aria-label="Back to pools">×</button>}{children}</div>;
}

