'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runChatAction, hasCtrlAltSwap } = require('../src/lib/chat-shortcuts');
const { resolveAction } = require('../src/lib/keymap');
test('local chat chords map correctly, including existing remapped Ctrl', () => {
  for (const modifiers of [{ control:true }, { alt:true }]) {
    const key = (code, shift=false) => ({ type:'keyDown', code, key:code.slice(3), shift, ...modifiers });
    assert.equal(resolveAction(key('KeyT'), 'win32', 1, true), 'chat:new');
    assert.equal(resolveAction(key('KeyN'), 'win32', 1, true), 'noop');
    assert.equal(resolveAction(key('KeyN',true), 'win32', 1, true), 'chat:temporary');
    assert.equal(resolveAction(key('KeyW'), 'win32', 1, true), 'chat:delete');
    assert.equal(resolveAction(key('KeyW',true), 'win32', 1, true), 'noop');
  }
  assert.equal(resolveAction({type:'keyDown',key:'n',alt:true},'win32',1,false),'noop');
  assert.equal(resolveAction({type:'keyDown',key:'n',control:true,alt:true},'win32',1,true),'noop');
  assert.equal(resolveAction({type:'keyUp',key:'w',control:true},'win32',1,true),'noop');
});
function contents(url) {
  return { events:[], urls:[], isDestroyed:()=>false, getURL:()=>url, focus(){},
    sendInputEvent(e){this.events.push(e);}, async loadURL(u){this.urls.push(u);} };
}
test('delete opens native confirmation without confirming or navigating', async () => {
  const wc=contents('https://chatgpt.com/c/01234567-abcd-1234-abcd-012345678901');
  assert.equal(await runChatAction(wc,'chat:delete'),true);
  assert.deepEqual(wc.events,[
    {type:'keyDown',keyCode:'Backspace',modifiers:['control','shift']},
    {type:'keyUp',keyCode:'Backspace',modifiers:['control','shift']},
  ]);
  assert.deepEqual(wc.urls,[]);
});
test('delete refuses new, shared, authentication and foreign pages', async () => {
  for (const url of ['https://chatgpt.com/','https://chatgpt.com/share/abc','https://auth.openai.com/c/abc','https://chatgpt.com.evil.invalid/c/abc','http://chatgpt.com/c/abc']) {
    const wc=contents(url);assert.equal(await runChatAction(wc,'chat:delete'),false);assert.deepEqual(wc.events,[]);
  }
});
test('new uses native shortcut; temporary starts the temporary route', async () => {
  const wc=contents('https://chatgpt.com/');
  await runChatAction(wc,'chat:new');assert.equal(wc.events[0].keyCode,'O');
  await runChatAction(wc,'chat:temporary');assert.deepEqual(wc.urls,['https://chatgpt.com/?temporary-chat=true']);
});
test('only a full existing left Ctrl/Alt swap enables aliases', () => {
  assert.equal(hasCtrlAltSwap(null),false);
  assert.equal(hasCtrlAltSwap({remapKeys:{inProcess:[{originalKeys:'162',newRemapKeys:'164'}]}}),false);
  assert.equal(hasCtrlAltSwap({remapKeys:{inProcess:[{originalKeys:'162',newRemapKeys:'164'},{originalKeys:'164',newRemapKeys:'162'}]}}),true);
});
