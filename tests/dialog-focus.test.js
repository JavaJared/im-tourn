import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';
import { useDialog } from '../src/lib/useDialog';
let tree;
afterEach(() => { if (tree) act(() => tree.unmount()); vi.unstubAllGlobals(); });
function Harness({ open = true, close, name }) { const ref = useDialog(open, close); return createElement('div', { ref, name }); }
function fixture() {
  const handlers = {};
  const document = { body: { style: { overflow: 'auto' } }, activeElement: null,
    addEventListener: (key, fn) => (handlers[key] ||= new Set()).add(fn),
    removeEventListener: (key, fn) => handlers[key]?.delete(fn),
  };
  const element = name => ({ name, isConnected: true, hidden: false, getAttribute: () => null, getClientRects: () => [1], focus() { document.activeElement = this; } });
  const trigger = element('trigger'); document.activeElement = trigger;
  const dialog = name => {
    const buttons = [element(`${name}-first`), element(`${name}-last`)];
    const node = { ...element(name), querySelectorAll: () => buttons, contains: target => target === node || buttons.includes(target), hasAttribute: () => false, setAttribute: vi.fn(), buttons };
    return node;
  };
  const outer = dialog('outer'), inner = dialog('inner');
  vi.stubGlobal('document', document);
  return { document, trigger, outer, inner, key: (key, shiftKey = false) => { const event = { key, shiftKey, preventDefault: vi.fn(), stopPropagation: vi.fn() }; handlers.keydown?.forEach(fn => fn(event)); return event; } };
}
test('Tab stays inside a dialog and closing restores focus and scrolling', () => {
  const f = fixture();
  act(() => { tree = create(createElement(Harness, { close: vi.fn() }), { createNodeMock: () => f.outer }); });
  expect(f.document.activeElement).toBe(f.outer.buttons[0]); expect(f.document.body.style.overflow).toBe('hidden');
  f.key('Tab', true); expect(f.document.activeElement).toBe(f.outer.buttons[1]);
  f.key('Tab'); expect(f.document.activeElement).toBe(f.outer.buttons[0]);
  act(() => tree.unmount()); tree = null;
  expect(f.document.activeElement).toBe(f.trigger); expect(f.document.body.style.overflow).toBe('auto');
});
test('Escape closes only the top dialog and returns focus to its parent', () => {
  const f = fixture(), closeOuter = vi.fn(), closeInner = vi.fn();
  const render = inner => createElement('section', {}, createElement(Harness, { name: 'outer', close: closeOuter }), inner && createElement(Harness, { name: 'inner', close: closeInner }));
  act(() => { tree = create(render(false), { createNodeMock: element => element.props.name === 'outer' ? f.outer : f.inner }); });
  act(() => tree.update(render(true)));
  f.key('Escape'); expect(closeInner).toHaveBeenCalledOnce(); expect(closeOuter).not.toHaveBeenCalled();
  act(() => tree.update(render(false)));
  expect(f.document.activeElement).toBe(f.outer.buttons[0]); expect(f.document.body.style.overflow).toBe('hidden');
});
