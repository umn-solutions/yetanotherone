import { Container, Text, Button, LinkButton, Image, ContextStore, Toast, getIcon, registerIcons } from '../libs/nofbiz/nofbiz.base.js';
import { openNewInitiativeModal } from './new-initiative.js';
import { canAccess } from './roles.js';

registerIcons('place', {
  'home-outline': `<svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 11l9-8 9 8v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/><polyline points='9 22 9 12 15 12 15 22'/></svg>`,
});

const HEADER_ROUTES = ['instrucoes'];

const TAB_LABELS = {
  inicio: 'Página Inicial',
  instrucoes: 'Instruções',
  pessoal: 'Pessoal',
  geral: 'Geral',
  mentoria: 'Mentoria',
  gestor: 'Gestor',
  catalogo: 'Catálogo',
  dashboard: 'Dashboard',
  admin: 'Configuração',
};

function createHeader() {
  const user = ContextStore.get('currentUser');
  const userRoles = ContextStore.get('userRoles') || ['colaborador'];
  const displayName = user.get('displayName');
  const rawRole = userRoles[0] || 'colaborador';
  const role = rawRole.charAt(0).toUpperCase() + rawRole.slice(1);
  const roleLabel = ContextStore.has('isBootstrapMode')
    ? `${role} (Bootstrap)` : role;

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  return new Container([
    new Container([
      new Image('@/media/cetelem-logo.png', { class: 'pace-header__logo' }),
      new Image('@/media/logo-2.png', { class: 'pace-header__logo' }),
      new Container([], { as: 'span', class: 'pace-header__divider' }),
      new Container([
        new Text('Plataforma de melhoria contínua', { type: 'span', class: 'pace-header__platform-sub' }),
      ], { class: 'pace-header__platform' }),
    ], { class: 'pace-header__left' }),
    new Container([
      new LinkButton('Ajuda', 'instrucoes', { class: 'pace-header__info-btn' }),
      new Container([
        new Text(displayName, { type: 'span', class: 'pace-header__user-name' }),
        new Text(roleLabel, { type: 'span', class: 'pace-header__user-role' }),
      ], { class: 'pace-header__user' }),
      new Text(getInitials(displayName), { type: 'span', class: 'pace-header__avatar' }),
    ], { class: 'pace-header__right' }),
  ], { as: 'header', class: 'pace-header' });
}

function createTabBar() {
  const routes = ContextStore.get('routes');
  const allTabs = ['inicio', ...routes].filter((key) => !HEADER_ROUTES.includes(key) && key !== 'dashboard');

  const tabLinks = allTabs.map((key) => {
    const path = key === 'inicio' ? '/' : key;
    const label = key === 'inicio'
      ? [new Container([getIcon('home-outline')], { as: 'span', class: 'pace-tab-icon' }), ' ' + TAB_LABELS[key]]
      : TAB_LABELS[key];
    return new LinkButton(label, path, {
      class: `pace-tabs__tab pace-tab-${key}`,
    });
  });

  const ctaButton = canAccess('pessoal') ? [new Button('+ Partilhar uma iniciativa', {
    class: 'pace-tabs__cta',
    onClickHandler: () => {
      openNewInitiativeModal(() => {
        Toast.success('Iniciativa criada. A página será actualizada.');
      });
    },
  })] : [];

  return new Container([...tabLinks, ...ctaButton], { as: 'nav', class: 'pace-tabs' });
}

export function createPageLayout(content, options = {}) {
  const { contentClass = '' } = options;
  const mainClass = contentClass ? `pace-content ${contentClass}` : 'pace-content';
  return [
    createHeader(),
    createTabBar(),
    new Container(content, { as: 'main', class: mainClass }),
  ];
}
