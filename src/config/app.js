const ADMIN_USER_IDS = ['VBbDwj6gkVgW7gBcs3vTmt0ulLF2'];

const FEATURES = { predictions: false, drafts: false, pastChampions: false, kristinTiers: true };

const isHiddenView = (v) =>
  (!FEATURES.predictions &&
    (v === 'prediction-pools' ||
      v === 'create-prediction-pool' ||
      v.startsWith('prediction-pool-'))) ||
  (!FEATURES.drafts &&
    (v === 'drafts' ||
      v === 'create-draft' ||
      v === 'my-drafts' ||
      (v.startsWith('draft-') && v !== 'drafts'))) ||
  (!FEATURES.pastChampions && v === 'champions') ||
  (!FEATURES.kristinTiers && v.startsWith('kristin-tiers'));

const CATEGORIES = [
  'Movies',
  'TV Shows',
  'Books',
  'Sports Teams',
  'Video Games',
  'Music Artists',
  'Food & Drinks',
  'Anime',
  'Superheroes',
  'Historical Figures',
  'Other',
];

export { ADMIN_USER_IDS, FEATURES, isHiddenView, CATEGORIES };
