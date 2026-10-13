// Shared by editors, players, pool boards and offscreen image exports.
// Resolve semantic tokens here instead of embedding a separate palette in each root.
export const competitionTheme = {
  '--bg': 'var(--color-canvas, #f8fafc)',
  '--surface': 'var(--color-surface, #ffffff)',
  '--surface2': 'var(--color-subtle, #e8eef5)',
  '--line': 'var(--color-line, #d4ddea)',
  '--text': 'var(--color-ink, #15253f)',
  '--muted': 'var(--color-muted, #52627a)',
  '--orange': 'var(--color-brand, #1463ff)',
  '--teal': 'var(--color-brand-hover, #084ed6)',
};
