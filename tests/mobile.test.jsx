import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { publicOrigin } from '../src/mobile/platform';
import { handleNativeBack } from '../src/mobile/NativeBridge';
import AuthModal from '../src/components/dialogs/AuthModal';
vi.mock('@capacitor/core', () => ({Capacitor:{isNativePlatform:vi.fn()}}));
vi.mock('../src/lib/useDialog', () => ({useDialog:()=>({current:null})}));
vi.mock('../src/contexts/AuthContext', () => ({useAuth:()=>({
 signup:vi.fn(), login:vi.fn(), loginWithGoogle:vi.fn(), resetPassword:vi.fn()
})}));
let tree;
afterEach(()=>{if(tree)act(()=>tree.unmount());tree=null;vi.unstubAllGlobals();vi.clearAllMocks();});
test('native invite links use the public website, web preserves its origin',()=>{
 vi.stubGlobal('window',{location:{origin:'https://preview.example'}});
 Capacitor.isNativePlatform.mockReturnValue(true);
 expect(publicOrigin()).toBe('https://imtourn.com');
 Capacitor.isNativePlatform.mockReturnValue(false);
 expect(publicOrigin()).toBe('https://preview.example');
});
test.each([true,false])('password field stays available on native=%s; Google popup is web only',native=>{
 Capacitor.isNativePlatform.mockReturnValue(native);
 act(()=>{tree=create(<AuthModal isOpen onClose={()=>{}}/>);});
 expect(tree.root.findAllByProps({type:'password'})).toHaveLength(1);
 expect(tree.root.findAllByProps({className:'google-btn'})).toHaveLength(native?0:1);
});
test('native back dismisses a dialog before navigating; root minimizes',()=>{
 vi.stubGlobal('KeyboardEvent',class {constructor(type,options){this.type=type;Object.assign(this,options);}});
 const document={querySelector:vi.fn(()=>({})),dispatchEvent:vi.fn()};
 const history={back:vi.fn()},minimize=vi.fn();
 handleNativeBack({canGoBack:true},{document,history,minimize});
 expect(document.dispatchEvent.mock.calls[0][0].key).toBe('Escape');
 expect(history.back).not.toHaveBeenCalled();
 document.querySelector.mockReturnValue(null);
 handleNativeBack({canGoBack:true},{document,history,minimize});
 expect(history.back).toHaveBeenCalledTimes(1);
 handleNativeBack({canGoBack:false},{document,history,minimize});
 expect(minimize).toHaveBeenCalledTimes(1);
});
