import {
  Text,
  Container,
  Button,
  LinkButton,
  Toast,
  ContextStore,
  defineRoute,
  __dayjs,
} from '../libs/nofbiz/nofbiz.base.js';

import { getRecentForUser } from '../utils/notifications-api.js';
import { openNewInitiativeModal } from '../utils/new-initiative.js';
import { createPageLayout } from '../utils/navbar.js';
import { APP_NAME, ORG_NAME } from '../utils/constants.js';
import { hasProfile, ROLES } from '../utils/roles.js';

export default defineRoute(async (config) => {
  config.setRouteTitle('Início');

  const user = ContextStore.get('currentUser');
  const displayName = user.get('displayName') || 'Colaborador';
  const firstName = displayName.split(' ')[0];

  // -- Fetch recent notifications --
  let recentNotifications = [];
  try {
    recentNotifications = await getRecentForUser(user.get('email'), 14);
  } catch (error) {
    console.error('[home/getRecentForUser] failed', error);
    Toast.error('Erro ao carregar notificações.');
  }

  // Sort by date descending
  recentNotifications.sort((a, b) => (b.CreatedDate || '').localeCompare(a.CreatedDate || ''));

  // -- Hero welcome banner --
  const isGestor = hasProfile(ROLES.GESTOR);

  const heroContent = [
    new Text(`${APP_NAME.toUpperCase()} - ${ORG_NAME.toUpperCase()}`, { type: 'span', class: 'pace-hero-badge' }),
    new Text(`Olá, ${firstName}`, { type: 'h1' }),
    new Text('Bem-vindo à plataforma de melhoria contínua. Submeta ideias, acompanhe o progresso e quantifique o impacto das suas iniciativas.', { type: 'p' }),
  ];

  if (!isGestor) {
    const newInitiativeBtn = new Button('+ Nova Iniciativa', {
      variant: 'primary',
      onClickHandler: () => {
        openNewInitiativeModal(() => {
          Toast.success('Iniciativa criada. A página será actualizada.');
        });
      },
    });
    heroContent.push(
      new Container([
        newInitiativeBtn,
        new LinkButton('Ver as minhas iniciativas', 'pessoal', { variant: 'secondary', class: 'pace-hero-link-btn' }),
      ], { class: 'pace-hero__actions' }),
    );
  }

  const hero = new Container([
    new Container(heroContent, { class: 'pace-hero__content' }),
  ], { class: 'pace-hero' });

  // -- Notifications (already date-filtered by CAML) --
  const formatRelativeTime = (dateStr) => {
    const days = __dayjs().diff(__dayjs(dateStr), 'day');
    if (days === 0) return 'hoje';
    if (days === 1) return 'há 1 dia';
    if (days < 7) return `há ${days} dias`;
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'há 1 semana' : `há ${weeks} semanas`;
  };

  const notifItems = recentNotifications.map((n) => {
    return new Container([
      new Container([], { class: 'pace-notif-icon' }),
      new Container([
        new Text(n.Title, { type: 'span' }),
        new Text(formatRelativeTime(n.CreatedDate), { type: 'span', class: 'pace-notif-date' }),
      ]),
    ], { class: 'pace-notif-item' });
  });

  const emptyNotif = recentNotifications.length === 0
    ? [new Text('Sem notificações recentes.', { type: 'p', class: 'pace-empty-msg' })]
    : [];

  const notificationsSection = new Container([
    new Text('Notificações (últimas 2 semanas)', { type: 'h2', class: 'pace-sec-title pace-sec-title--plain' }),
    new Container([...notifItems, ...emptyNotif], { as: 'div', class: 'pace-notif-list' }),
  ], { class: 'pace-home-notifications' });

  const twoColGrid = new Container([
    notificationsSection,
  ], { class: 'pace-home-grid' });

  return createPageLayout([hero, twoColGrid]);
});
