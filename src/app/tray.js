'use strict';

const { Menu, Tray } = require('electron');

const { buildTemplate } = require('../lib/tray-template');

function toMenuTemplate(items, dispatch) {
  return items.map((item) => {
    const out = { ...item };
    delete out.action;
    if (item.submenu) out.submenu = toMenuTemplate(item.submenu, dispatch);
    if (item.action) out.click = () => dispatch(item.action);
    return out;
  });
}

function createTray(iconPath, getState, dispatch) {
  const tray = new Tray(iconPath);
  function refresh() {
    const state = getState();
    tray.setToolTip(state.tooltip ?? 'Mira Sidebar');
    const items = buildTemplate(state).filter(item => !['Provider', 'Enabled Providers'].includes(item.label));
    tray.setContextMenu(Menu.buildFromTemplate(toMenuTemplate(items, dispatch)));
  }
  tray.on('click', () => dispatch('toggle-window'));
  refresh();
  return { tray, refresh };
}

module.exports = { createTray };
