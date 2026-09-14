'use strict';

window.companion.onState((state) => {
  document.getElementById('status').textContent = state.status || state.hotkey;
  document.getElementById('hide').title = `Hide sidebar (${state.hotkey})`;
});
document.getElementById('menu').onclick = () => window.companion.action('menu');
document.getElementById('hide').onclick = () => window.companion.action('hide-window');
document.getElementById('reload').onclick = () => window.companion.action('reload-page');

const findBar = document.getElementById('findbar');
const findInput = document.getElementById('find-query');
const findCount = document.getElementById('find-count');
let findTimer;
function searchPage(action = 'new') {
  clearTimeout(findTimer);
  if (!findBar.hidden) window.companion.find({ action, query: findInput.value });
}
window.companion.onFind(state => {
  if (typeof state.open === 'boolean') {
    clearTimeout(findTimer);
    findBar.hidden = !state.open;
    document.getElementById('tabs').hidden = state.open;
    if (state.open) {
      findInput.value = state.query || '';
      findCount.textContent = '';
      findInput.focus();
      findInput.select();
    }
  }
  if (typeof state.count === 'number') {
    findCount.textContent = findInput.value ? `${state.current || 0}/${state.count}` : '';
  }
});
findInput.addEventListener('input', () => {
  clearTimeout(findTimer);
  findCount.textContent = '';
  findTimer = setTimeout(() => searchPage(), 120);
});
findBar.addEventListener('submit', event => { event.preventDefault(); searchPage('next'); });
findInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); searchPage('previous'); }
});
document.getElementById('find-previous').onclick = () => searchPage('previous');
document.getElementById('find-close').onclick = () => window.companion.find({ action: 'close' });