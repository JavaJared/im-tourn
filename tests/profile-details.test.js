import { createRequire } from 'node:module';
import { expect, test } from 'vitest';
const require = createRequire(import.meta.url);
const { validateDetails } = require('../functions/profile-details').internal;

test('profile edits accept plain text and explicit photo removal', () => {
  expect(validateDetails({ bio: '  Hello\nthere  ', photo: null })).toEqual({ bio: 'Hello\nthere', bytes: null, changePhoto: true });
  expect(validateDetails({ bio: '' }).changePhoto).toBe(false);
});
test('profile edits reject oversized bios and malformed or oversized photos', () => {
  for (const data of [{ bio: 2 }, { bio: 'a'.repeat(301) }, { bio: '', photo: 'https://example.com/a.jpg' }, { bio: '', photo: 'a'.repeat(350001) }, { bio: '', photo: 'bm90IGFuIGltYWdl' }]) {
    expect(() => validateDetails(data)).toThrow();
  }
});
