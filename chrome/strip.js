'use strict';

window.companion.onState((state) => {
  document.getElementById('status').textContent = state.status || state.hotkey;
  document.getElementById('hide').title = `Hide sidebar (${state.hotkey})`;
});
document.getElementById('menu').onclick = () => window.companion.action('menu');
document.getElementById('hide').onclick = () => window.companion.action('hide-window');
document.getElementById('reload').onclick = () => window.companion.action('reload-page');
