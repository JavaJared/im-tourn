export const publicPages = {
  home: ['For You — Brackets and Rankings', 'Create brackets for movies, shows, sports, and more. Make your picks, share with friends, and crown a champion.'],
  browse: ['Browse Brackets', 'Explore community brackets by category, title, or creator.'],
  pools: ['Bracket Pools', 'Compete with friends in bracket pools, submit predictions, and follow official results and standings.'],
  rankings: ['Community Rankings', 'Compare entries head to head and explore community rankings.'],
  weekly: ['Weekly Brackets', 'Vote in the weekly tournament and help decide the champion.'],
  privacy: ['Privacy Policy', 'Learn how I’m Tourn handles account information, saved picks, and browser storage.'],
  terms: ['Terms of Service', 'Read the terms for using I’m Tourn and sharing community content.'],
};
export function pageMetadata(view) {
  const page = publicPages[view];
  return { title: (page?.[0] || (view === 'not-found' ? 'Page Not Found' : 'Your Tournament')) + ' | I’m Tourn',
    description: page?.[1] || 'Create, play, and share tournaments on I’m Tourn.',
    canonical: 'https://imtourn.com/' + (page && view !== 'home' ? '?view=' + view : ''),
    robots: page ? 'index,follow' : 'noindex,follow' };
}
