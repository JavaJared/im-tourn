import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import AuthModal from '../src/components/dialogs/AuthModal.jsx';
const auth = vi.hoisted(() => ({
  signup: vi.fn(),
  login: vi.fn(),
  loginWithGoogle: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../src/lib/useDialog', () => ({ useDialog: () => null }));
let tree, onClose;
beforeEach(() => {
  Object.values(auth).forEach((fn) => fn.mockReset());
  onClose = vi.fn();
  act(() => {
    tree = create(createElement(AuthModal, { isOpen: true, onClose }));
  });
});
afterEach(() => act(() => tree.unmount()));
const button = (text) =>
  tree.root.findAllByType('button').find((node) => node.children.join('') === text);
const send = () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} });
function resetMode() {
  act(() => button('Forgot password?').props.onClick());
  act(() =>
    tree.root
      .findByProps({ 'aria-label': 'Email' })
      .props.onChange({ target: { value: 'test@example.com' } }),
  );
}
it('offers an email-only recovery form with confirmation and return to login', async () => {
  resetMode();
  expect(tree.root.findAllByProps({ type: 'password' })).toHaveLength(0);
  await act(send);
  expect(auth.resetPassword).toHaveBeenCalledWith('test@example.com');
  expect(auth.login).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(tree.root.findByProps({ role: 'status' }).children.join('')).toContain(
    'If an account uses this email',
  );
  act(() => button('Log In').props.onClick());
  expect(tree.root.findAllByProps({ type: 'password' })).toHaveLength(1);
  expect(tree.root.findAllByProps({ role: 'status' })).toHaveLength(0);
});
it('shows retryable reset errors and blocks duplicate reset requests', async () => {
  resetMode();
  let reject;
  auth.resetPassword.mockImplementationOnce(
    () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  let pending;
  act(() => {
    pending = send();
    send();
  });
  expect(auth.resetPassword).toHaveBeenCalledTimes(1);
  await act(async () => {
    reject({ code: 'auth/too-many-requests' });
    await pending;
  });
  expect(tree.root.findByProps({ role: 'alert' }).children.join('')).toContain('Too many attempts');
  expect(button('Send Reset Link').props.disabled).toBe(false);
  await act(send);
  expect(tree.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
});
it.each(['login', 'signup'])('preserves the existing %s flow', async (mode) => {
  if (mode === 'signup') act(() => button('Sign Up').props.onClick());
  await act(send);
  expect(auth[mode]).toHaveBeenCalledTimes(1);
  expect(auth.resetPassword).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});
it('preserves Google login', async () => {
  const google = tree.root.findByProps({ className: 'google-btn' });
  await act(() => google.props.onClick());
  expect(auth.loginWithGoogle).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
it('ignores a reset response after the dialog has closed and reopened', async () => {
  resetMode();
  let resolve;
  auth.resetPassword.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  let pending;
  act(() => {
    pending = send();
  });
  act(() => tree.update(createElement(AuthModal, { isOpen: false, onClose })));
  act(() => tree.update(createElement(AuthModal, { isOpen: true, onClose })));
  await act(async () => {
    resolve();
    await pending;
  });
  expect(tree.root.findAllByProps({ role: 'status' })).toHaveLength(0);
  expect(tree.root.findAllByProps({ type: 'password' })).toHaveLength(1);
});
