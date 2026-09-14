import { S } from './poolStyles';

const TABS = [['bracket', 'My Picks'], ['results', 'Official Results'], ['leaderboard', 'Standings'], ['rules', 'Rules']];

export default function PoolTabs({ activeTab, onChange }) {
  const handleKey = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    onChange(TABS[next][0]);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
  };
  return <div style={S.tabs} className="pool-tabs" role="tablist" aria-label="Pool sections">
    {TABS.map(([key, label], index) => <button key={key} id={`pool-tab-${key}`} role="tab"
      aria-selected={activeTab === key} aria-controls={`pool-panel-${key}`} tabIndex={activeTab === key ? 0 : -1}
      style={S.tab(activeTab === key)} onClick={() => onChange(key)} onKeyDown={event => handleKey(event, index)}>{label}</button>)}
  </div>;
}
