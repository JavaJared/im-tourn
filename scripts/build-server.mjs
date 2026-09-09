import { build } from 'esbuild';
await build({ entryPoints: ['src/lib/serverScoring.js'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: 'functions/generated/scoring.cjs' });
