'use strict';

function createPageFind({ getContents, focusBar, send }) {
  let contents = null;
  let query = '';
  let requestId = null;
  function result(_event, value) {
    if (value.requestId === requestId) send({ count: value.matches, current: value.activeMatchOrdinal });
  }
  function navigation(event, _url, _sameDocument, isMainFrame) {
    if (event.isMainFrame ?? isMainFrame) close(false);
  }
  function destroyed() { close(false); }
  function close(focusPage = true) {
    const previous = contents;
    contents = null;
    requestId = null;
    if (previous) {
      previous.removeListener('found-in-page', result);
      previous.removeListener('did-start-navigation', navigation);
      previous.removeListener('destroyed', destroyed);
      if (!previous.isDestroyed()) {
        previous.stopFindInPage('clearSelection');
        if (focusPage) previous.focus();
      }
    }
    send({ open: false });
  }
  function search(text, direction = 'new') {
    if (!contents || contents.isDestroyed()) return;
    const sameQuery = text === query;
    query = text;
    if (!query) {
      requestId = null;
      contents.stopFindInPage('clearSelection');
      send({ count: 0, current: 0 });
      return;
    }
    requestId = contents.findInPage(query, {
      forward: direction !== 'previous',
      findNext: direction !== 'new' && sameQuery,
      matchCase: false,
    });
  }
  function open() {
    const next = getContents();
    if (!next || next.isDestroyed()) return;
    if (contents !== next) {
      close(false);
      contents = next;
      contents.on('found-in-page', result);
      contents.on('did-start-navigation', navigation);
      contents.on('destroyed', destroyed);
    }
    focusBar();
    send({ open: true, query });
    search(query);
  }
  return { open, close, search, isOpen: () => contents !== null };
}

module.exports = { createPageFind };
