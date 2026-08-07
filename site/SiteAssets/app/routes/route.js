import {
  Text,
  Container,
  Button,
  LinkButton,
  Image,
  Toast,
  ContextStore,
  defineRoute,
  getIcon,
  __dayjs,
  resolvePath,
} from '../libs/nofbiz/nofbiz.base.js';

import { getRecentForUser } from '../utils/notifications-api.js';
import { openNewInitiativeModal } from '../utils/new-initiative.js';
import { createPageLayout } from '../utils/navbar.js';
import { hasProfile, ROLES } from '../utils/roles.js';
import { MENTOR_TEAM_EMAIL } from '../utils/constants.js';

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
    new Container([
      new Container([], { as: 'span', class: 'pace-hero-badge__dot' }),
      new Text('PLACE · Plan · Do · Check · Act', { type: 'span' }),
    ], { as: 'span', class: 'pace-hero-badge' }),
    new Container([
      new Text(`Olá, ${firstName}.`, { type: 'span' }),
      new Text('O que vamos mudar hoje?', { type: 'span', class: 'pace-hero__title-accent' }),
    ], { as: 'h1', class: 'pace-hero__title' }),
    new Text('Submete iniciativas, acompanha o impacto e celebra as transformações que vais construindo com a tua equipa.', { type: 'p' }),
  ];

  if (!isGestor) {
    const newInitiativeBtn = new Button('+ Partilhar uma iniciativa', {
      variant: 'primary',
      class: 'pt-btn-hero-primary pt-btn-lg',
      onClickHandler: () => {
        openNewInitiativeModal(() => {
          Toast.success('Iniciativa criada. A página será actualizada.');
        });
      },
    });
    heroContent.push(
      new Container([
        newInitiativeBtn,
        new LinkButton('Ver as minhas iniciativas', 'pessoal', { variant: 'secondary', class: 'pt-btn-hero-ghost pt-btn-lg' }),
      ], { class: 'pace-hero__actions' }),
    );
  }

  const hero = new Container([
    new Container([], { class: 'pace-hero__pattern' }),
    new Container(heroContent, { class: 'pace-hero__content' }),
    new Image(resolvePath('@/media/mascot.png'), { class: 'pace-hero__visual' }),
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
    new Text('Notificações (últimas 2 semanas)', { type: 'h2', class: 'pt-section-header__title' }),
    new Container([...notifItems, ...emptyNotif], { as: 'div', class: 'pace-notif-list' }),
  ], { class: 'pace-home-notifications pt-card' });

  // -- Mentor team contacts --
  const mentorContactsSection = new Container([
    new Text('Equipa de mentores', { type: 'h2', class: 'pt-section-header__title' }),
    new Text('A nossa equipa de mentores está pronta para ajudar. Tens dúvidas sobre a tua iniciativa ou precisas de orientação? Fala connosco.', { type: 'p', class: 'pace-mentor-contacts__text' }),
    new LinkButton([
      new Container([getIcon('mail-line')], { as: 'span', class: 'pace-btn-icon' }),
      'Contactar por email',
    ], `mailto:${MENTOR_TEAM_EMAIL}`, { variant: 'primary', class: 'pt-btn-hero-primary pace-mentor-contacts__btn' }),
  ], { class: 'pace-mentor-contacts pt-card' });

  const twoColGrid = new Container([
    notificationsSection,
    mentorContactsSection,
  ], { class: 'pace-home-grid' });

  return createPageLayout([hero, twoColGrid], { contentClass: 'pt-v2' });
});
