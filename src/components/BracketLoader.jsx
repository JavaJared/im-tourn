import './BracketLoader.css';

export default function BracketLoader({label='Loading page…',compact=false}){
  return <div className={`bracket-loader${compact?' bracket-loader--compact':''}`} role="status" aria-live="polite">
    <svg viewBox="0 0 240 128" aria-hidden="true" focusable="false">
      <g className="bracket-loader-lines" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
        <path d="M48 20h28v12h28M48 44h28V32M48 92h28v12h28M48 116h28v-12"/>
        <path d="M136 32h24v42h28M136 104h24V74"/>
      </g>
      {[20,44,92,116].map(y=><rect key={y} className="bracket-loader-entry" x="12" y={y-8} width="36" height="16" rx="5"/>)}
      <rect className="bracket-loader-round" x="104" y="24" width="32" height="16" rx="5"/>
      <rect className="bracket-loader-round bracket-loader-round--second" x="104" y="96" width="32" height="16" rx="5"/>
      <g className="bracket-loader-champion"><rect x="188" y="64" width="40" height="32" rx="8"/><path d="m197 87-2-13 8 6 5-10 5 10 8-6-2 13Z"/></g>
    </svg>
    <span>{label}</span>
  </div>;
}
