import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';
import UsernameForm from '../src/components/account/UsernameForm';
import UsernameSetup from '../src/components/account/UsernameSetup';
let tree;
afterEach(() => { if (tree) act(() => tree.unmount()); });
test('taken usernames remain editable and retry does not recreate an auth account', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('That username is taken.')).mockResolvedValueOnce({username:'available'});
  await act(async () => { tree = create(<UsernameForm onSave={save} setup />); });
  const input = () => tree.root.findByType('input');
  await act(async () => input().props.onChange({target:{value:'taken'}}));
  await act(async () => tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
  expect(JSON.stringify(tree.toJSON())).toContain('That username is taken.');
  expect(input().props.disabled).toBe(false);
  await act(async () => input().props.onChange({target:{value:'available'}}));
  await act(async () => tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
  expect(save.mock.calls).toEqual([['taken'],['available']]);
  expect(JSON.stringify(tree.toJSON())).toContain('Username saved.');
});
test('account loading failures offer retry without offering a setup bypass', async () => {
  const retry = vi.fn();
  await act(async () => { tree = create(<UsernameSetup account={{error:'Network unavailable'}} onRetry={retry} onLogout={()=>{}} />); });
  expect(tree.root.findAllByType('form')).toHaveLength(0);
  await act(async () => tree.root.findAllByType('button')[0].props.onClick());
  expect(retry).toHaveBeenCalledOnce();
});
