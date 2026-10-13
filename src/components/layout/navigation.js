import { FEATURES } from '../../config/app';
export const exploreDestinations = [
  { view:'browse', label:'Brackets' }, { view:'rankings', label:'Rankings' },
  { view:'arena', label:'GOAT Arena' }, { view:'pools', label:'Pools' }, { view:'weekly', label:'Weekly bracket' },
  ...(FEATURES.predictions ? [{ view:'prediction-pools', label:'Predictions' }] : []),
  ...(FEATURES.drafts ? [{ view:'drafts', label:'Drafts' }] : []),
  ...(FEATURES.pastChampions ? [{ view:'champions', label:'Past Champions' }] : []),
];
export const creationDestinations = [
  {view:'create',label:'Bracket'}, {view:'create-ranking',label:'Ranking'},
  {view:'create-pool',label:'Bracket pool'}, {view:'arena',label:'Request a GOAT debate'},
  ...(FEATURES.predictions ? [{view:'create-prediction-pool',label:'Prediction pool'}] : []),
  ...(FEATURES.drafts ? [{view:'create-draft',label:'Draft'}] : []),
];
export function navigationSection(view) {
  if (view === 'home' || view.startsWith('feed-post-')) return 'home';
  if (view === 'my-activities' || view.startsWith('my-') || view === 'profile' || view.startsWith('profile-') || view === 'friends' || view === 'admin') return 'my-activities';
  if (view === 'create' || view.startsWith('create-')) return 'create';
  return 'browse';
}
export function legacySurface(view) {
  // Keep only the not-yet-migrated tools in their original contained theme.
  return ['drafts', 'my-drafts', 'create-draft', 'prediction-pools', 'create-prediction-pool', 'kristin-tiers'].includes(view)
    || ['draft-', 'prediction-pool-', 'kristin-tiers-'].some(prefix => view.startsWith(prefix));
}
