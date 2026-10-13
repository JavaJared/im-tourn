import ViewLink from './ViewLink';
import { exploreDestinations } from './navigation';
export { default as CreateAction } from './CreateMenu';
export default function ExploreHeader({ currentView, onNavigate }) {
  return <><header className="page-heading"><h1>Explore</h1></header>
    <nav className="section-switcher" aria-label="Explore">{exploreDestinations.map(item => <ViewLink key={item.view} view={item.view} currentView={currentView} onNavigate={onNavigate}>{item.label}</ViewLink>)}</nav></>;
}
