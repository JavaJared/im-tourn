import React from 'react';
import {act,create} from 'react-test-renderer';
import {expect,test,vi} from 'vitest';
import {CreateAction} from '../src/components/layout/ExploreHeader';

test('touch selection remains open until activation; outside interaction and Escape dismiss',()=>{
  const listeners={},focus=vi.fn(),navigate=vi.fn();
  const inside={},outside={},menu={open:true,contains:target=>target===inside,querySelector:()=>({focus})};
  vi.stubGlobal('document',{addEventListener:(name,fn)=>{listeners[name]=fn;},removeEventListener:(name)=>{delete listeners[name];}});
  let tree;
  try {
    act(()=>{tree=create(<CreateAction onNavigate={navigate}/>,{createNodeMock:element=>element.type==='details'?menu:null});});
    const details=tree.root.findByType('details');
    expect(details.props.onBlur).toBeUndefined();
    act(()=>listeners.pointerdown({target:inside}));expect(menu.open).toBe(true);
    const panel=tree.root.findByProps({className:'action-disclosure-panel'});
    tree.root.findAllByType('a').forEach((link,index)=>{
      menu.open=true;
      act(()=>link.props.onClick({button:0,preventDefault:vi.fn()}));
      expect(navigate).toHaveBeenLastCalledWith(index===0?'create':'create-ranking');
      act(()=>panel.props.onClick({target:{closest:()=>inside}}));expect(menu.open).toBe(false);
    });
    menu.open=true;act(()=>listeners.pointerdown({target:outside}));expect(menu.open).toBe(false);
    menu.open=true;act(()=>listeners.focusin({target:outside}));expect(menu.open).toBe(false);
    menu.open=true;act(()=>details.props.onKeyDown({key:'Escape',currentTarget:menu,stopPropagation:vi.fn()}));expect(menu.open).toBe(false);expect(focus).toHaveBeenCalled();
  } finally {if(tree)act(()=>tree.unmount());vi.unstubAllGlobals();}
  expect(Object.keys(listeners)).toHaveLength(0);
});
