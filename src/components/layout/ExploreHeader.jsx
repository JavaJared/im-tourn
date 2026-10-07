import ViewLink from './ViewLink';
import ActionDisclosure from '../ActionDisclosure';
export function CreateAction({ onNavigate }) {
  return <ActionDisclosure label="Create"><ViewLink view="create" onNavigate={onNavigate}>Bracket</ViewLink><ViewLink view="create-ranking" onNavigate={onNavigate}>Ranking</ViewLink></ActionDisclosure>;
}
export default function ExploreHeader({ currentView, onNavigate }) {
  return <><header className="page-heading"><h1>Explore</h1><CreateAction onNavigate={onNavigate}/></header>
    <nav className="section-switcher" aria-label="Explore"><ViewLink view="browse" currentView={currentView} onNavigate={onNavigate}>Brackets</ViewLink><ViewLink view="rankings" currentView={currentView} onNavigate={onNavigate}>Rankings</ViewLink><ViewLink view="weekly" currentView={currentView} onNavigate={onNavigate}>Weekly bracket</ViewLink><ViewLink view="arena" currentView={currentView} onNavigate={onNavigate}>GOAT Arena</ViewLink></nav></>;
}
