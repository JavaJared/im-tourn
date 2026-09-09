import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext.jsx';
const firebase = vi.hoisted(() => ({ reset: vi.fn(), auth: {} }));
vi.mock('../src/firebase', () => ({ auth: firebase.auth }));
vi.mock('firebase/auth', () => ({
  sendPasswordResetEmail: firebase.reset,
  onAuthStateChanged: (_, callback) => {
    callback(null);
    return () => {};
  },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  updateProfile: vi.fn(),
}));
let context, tree;
function Consumer() {
  context = useAuth();
  return null;
}
beforeEach(() => {
  firebase.reset.mockReset();
  act(() => {
    tree = create(createElement(AuthProvider, {}, createElement(Consumer)));
  });
});
afterEach(() => act(() => tree.unmount()));
it('uses Firebase password recovery with a trimmed email', async () => {
  await context.resetPassword(' test@example.com ');
  expect(firebase.reset).toHaveBeenCalledWith(firebase.auth, 'test@example.com');
});
it('does not disclose whether the email has an account', async () => {
  firebase.reset.mockRejectedValueOnce({ code: 'auth/user-not-found' });
  await expect(context.resetPassword('missing@example.com')).resolves.toBeUndefined();
});
it('preserves actionable errors for the dialog to report', async () => {
  const error = { code: 'auth/network-request-failed' };
  firebase.reset.mockRejectedValueOnce(error);
  await expect(context.resetPassword('test@example.com')).rejects.toBe(error);
});
