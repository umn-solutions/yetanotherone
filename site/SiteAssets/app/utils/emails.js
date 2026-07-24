/**
 * Single source of truth for all platform emails.
 *
 * To add an email:
 *  1. Add one key to EMAIL_EVENTS (value === key).
 *  2. Add one matching entry to EMAIL_TEMPLATES.
 *
 * Each template's to(ctx) returns an array of { email, name } objects (or plain
 * email strings -- normalizeRecipients coerces both). The body is rendered
 * per-recipient so each person receives a personalised greeting.
 *
 * send() sends email then, only on success per recipient, writes the bell record.
 * send() never throws -- failures are caught per-recipient, logged, and skipped.
 */

import { sendEmail, escapeHtml, SystemError, __dayjs } from '../libs/nofbiz/nofbiz.base.js';
import { createNotificationRecord } from './notifications-api.js';

const NOTIFICATION_TYPE = {
  STATE_CHANGE: 'state_change',
  COLLABORATION: 'collaboration',
  COMMENT: 'comment',
};

export const EMAIL_EVENTS = {
  SUBMITTED_OWNER: 'SUBMITTED_OWNER',
  SUBMITTED_MANAGER: 'SUBMITTED_MANAGER',
  RESUBMITTED: 'RESUBMITTED',
  SAVINGS_VALIDATION_REQUESTED: 'SAVINGS_VALIDATION_REQUESTED',
  CANCELLED: 'CANCELLED',
  DELETED: 'DELETED',
  MENTOR_APPROVED: 'MENTOR_APPROVED',
  REJECTED: 'REJECTED',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  EXECUTION_STARTED: 'EXECUTION_STARTED',
  SAVINGS_APPROVED: 'SAVINGS_APPROVED',
  MENTOR_FINAL_VALIDATED: 'MENTOR_FINAL_VALIDATED',
  IMPLEMENTED: 'IMPLEMENTED',
  GESTOR_TRANSFERRED: 'GESTOR_TRANSFERRED',
  GESTOR_CHANGED: 'GESTOR_CHANGED',
  OWNERSHIP_TRANSFERRED: 'OWNERSHIP_TRANSFERRED',
  OWNER_CHANGED: 'OWNER_CHANGED',
  ACCESS_GRANTED: 'ACCESS_GRANTED',
  ACCESS_REVOKED: 'ACCESS_REVOKED',
  COMMENT_ADDED: 'COMMENT_ADDED',
};

function getAppUrl() {
  try {
    const base = (typeof _spPageContextInfo !== 'undefined' && _spPageContextInfo && _spPageContextInfo.webAbsoluteUrl) || '';
    return base ? base + '/SitePages/app.aspx' : '';
  } catch (err) {
    console.warn('[emails] could not resolve app URL', err);
    return '';
  }
}

/**
 * Renders the email body HTML for a single recipient.
 * @param {string} intro - HTML intro paragraph (already escaped by template)
 * @param {boolean} pendingMentor - When true adds "enquanto aguarda pela validação de um mentor"
 * @param {string} recipientName - Display name of the recipient (may be empty)
 * @returns {string}
 */
function renderBody(intro, pendingMentor, recipientName) {
  const url = getAppUrl();
  const greeting = 'Olá' + (recipientName ? ' ' + escapeHtml(recipientName) : '') + ',';
  const followUp = 'Pode acompanhar o estado da iniciativa'
    + (pendingMentor ? ' enquanto aguarda pela validação de um mentor' : '')
    + '.';
  const linkLine = url ? `<p><a href="${url}">${url}</a></p>` : '';

  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1f2933;line-height:1.5;">`
    + `<p>${greeting}</p>`
    + `<p>${intro}</p>`
    + `<p>${followUp}</p>`
    + linkLine
    + `<hr style="border:none;border-top:1px solid #e4e7eb;margin:16px 0;">`
    + `<p style="margin:16px 0 0;"><i><b><span style="color:#2e7d32;">#leantogether</span></b></i></p>`
    + `<p style="margin:0;color:#2e7d32;">ACE &amp; Change Management</p>`
    + `</div>`;
}

/**
 * Normalises a mixed array of strings / { email, name } objects.
 * Filters falsy values, deduplicates by email, and excludes excludeEmail.
 * @param {Array<string|{email:string,name:string}>|string|null} to
 * @param {string|undefined} excludeEmail
 * @returns {{ email: string, name: string }[]}
 */
function normalizeRecipients(to, excludeEmail) {
  const arr = Array.isArray(to) ? to : (to ? [to] : []);
  const seen = new Set();
  const out = [];
  for (const entry of arr) {
    if (!entry) continue;
    const r = (typeof entry === 'string') ? { email: entry, name: '' } : entry;
    if (!r.email) continue;
    if (excludeEmail && r.email === excludeEmail) continue;
    if (seen.has(r.email)) continue;
    seen.add(r.email);
    out.push({ email: r.email, name: r.name || '' });
  }
  return out;
}

const EMAIL_TEMPLATES = {
  [EMAIL_EVENTS.SUBMITTED_OWNER]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    pendingMentor: true,
    to: (ctx) => {
      const ownerName = ctx.ownerName || ctx.initiative?.SubmittedBy?.displayName || '';
      return [{ email: ctx.initiative?.SubmittedByEmail, name: ownerName }];
    },
    subject: (ctx) => `Notificação de submissão da Iniciativa - ${ctx.initiative?.Title || ''}`,
    notificationTitle: (ctx) => `${ctx.initiative?.Title || ''} submetido. Aguarda validação de um mentor.`,
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      const dataHora = escapeHtml(ctx.dataHora || '');
      return `Informo que, em ${dataHora}, submeteu a iniciativa "<b>${T}</b>" na aplicação PLACE.`;
    },
  },
  [EMAIL_EVENTS.SUBMITTED_MANAGER]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    pendingMentor: true,
    to: (ctx) => ctx.manager ? [{ email: ctx.manager.email, name: ctx.manager.name || '' }] : [],
    subject: (ctx) => `Notificação de submissão da Iniciativa - ${ctx.initiative?.Title || ''}`,
    notificationTitle: (ctx) => {
      const ownerName = escapeHtml(ctx.ownerName || ctx.initiative?.SubmittedBy?.displayName || '');
      return `${ownerName} submeteu ${ctx.initiative?.Title || ''}.`;
    },
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      const dataHora = escapeHtml(ctx.dataHora || '');
      const ownerName = escapeHtml(ctx.ownerName || ctx.initiative?.SubmittedBy?.displayName || '');
      return `Informo que, em ${dataHora}, foi submetida a iniciativa "<b>${T}</b>" na aplicação PLACE pelo colaborador ${ownerName}.`;
    },
  },
  [EMAIL_EVENTS.RESUBMITTED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => {
      const recipients = [];
      if (ctx.initiative?.MentorEmail) {
        recipients.push({ email: ctx.initiative.MentorEmail, name: ctx.initiative.Mentor?.displayName || '' });
      }
      if (ctx.gestor?.email) {
        recipients.push({ email: ctx.gestor.email, name: ctx.gestor.displayName || '' });
      }
      return recipients;
    },
    subject: (ctx) => `Re-submissão da iniciativa - ${ctx.initiative?.UUID || ''}`,
    notificationTitle: (ctx) => `${ctx.initiative?.Title || ''} re-submetida. Aprovação pendente.`,
    intro: (ctx) => {
      const UUID = escapeHtml(ctx.initiative?.UUID || '');
      const T = escapeHtml(ctx.initiative?.Title || '');
      const ownerName = escapeHtml(ctx.initiative?.SubmittedBy?.displayName || '');
      return `Solicito aprovação para o pedido abaixo, registado na aplicação PLACE.<br>Iniciativa: <b>${UUID}</b> - ${T}<br>Colaborador: ${ownerName}<br><br>A aprovação é necessária para prosseguir com a iniciativa.`;
    },
  },
  [EMAIL_EVENTS.SAVINGS_VALIDATION_REQUESTED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.gestorEmail || ctx.initiative?.GestorValidatorEmail,
    notificationTitle: (ctx) => `${ctx.initiative?.Title || ''} requer validação de savings.`,
    subject: () => 'PLACE — Validação de savings pendente',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" requer a sua validação de savings.`;
    },
  },
  [EMAIL_EVENTS.CANCELLED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.initiative?.MentorEmail
      ? [{ email: ctx.initiative.MentorEmail, name: ctx.initiative.Mentor?.displayName || '' }]
      : [],
    subject: (ctx) => `Cancelamento da Iniciativa - ${ctx.initiative?.UUID || ''}`,
    notificationTitle: (ctx) => `${ctx.initiative?.Title || ''} foi cancelada.`,
    intro: (ctx) => {
      const UUID = escapeHtml(ctx.initiative?.UUID || '');
      const T = escapeHtml(ctx.initiative?.Title || '');
      const ownerName = escapeHtml(ctx.initiative?.SubmittedBy?.displayName || '');
      return `Informo que a seguinte iniciativa foi cancelada na aplicação PLACE.<br>Iniciativa: <b>${UUID}</b> - ${T}<br>Responsável: ${ownerName}`;
    },
  },
  [EMAIL_EVENTS.DELETED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.actor?.email ? [{ email: ctx.actor.email, name: ctx.actor.name || '' }] : [],
    subject: (ctx) => `Eliminação da Iniciativa - ${ctx.initiative?.UUID || ''}`,
    notificationTitle: (ctx) => `Eliminou a iniciativa ${ctx.initiative?.Title || ''}.`,
    intro: (ctx) => {
      const UUID = escapeHtml(ctx.initiative?.UUID || '');
      const T = escapeHtml(ctx.initiative?.Title || '');
      const ownerName = escapeHtml(ctx.initiative?.SubmittedBy?.displayName || '');
      return `Informo que a seguinte iniciativa foi eliminada da aplicação PLACE.<br>Iniciativa: <b>${UUID}</b> - ${T}<br>Responsável: ${ownerName}`;
    },
  },
  [EMAIL_EVENTS.MENTOR_APPROVED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => [{ email: ctx.initiative?.SubmittedByEmail, name: ctx.initiative?.SubmittedBy?.displayName || '' }],
    notificationTitle: () => 'Sua iniciativa foi aprovada pelo mentor.',
    subject: () => 'PLACE — Iniciativa aprovada pelo mentor',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A sua iniciativa "<b>${T}</b>" foi aprovada pelo mentor.`;
    },
  },
  [EMAIL_EVENTS.REJECTED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => [{ email: ctx.initiative?.SubmittedByEmail, name: ctx.initiative?.SubmittedBy?.displayName || '' }],
    notificationTitle: (ctx) => `${ctx.initiative?.Title || ''} foi rejeitado.`,
    subject: () => 'PLACE — Iniciativa rejeitada',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      let body = `A iniciativa "<b>${T}</b>" foi rejeitada.`;
      if (ctx.reason) body += `<br>Motivo: ${escapeHtml(ctx.reason)}`;
      return body;
    },
  },
  [EMAIL_EVENTS.REVISION_REQUESTED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => [{ email: ctx.initiative?.SubmittedByEmail, name: ctx.initiative?.SubmittedBy?.displayName || '' }],
    notificationTitle: (ctx) => `${ctx.initiative?.Title || ''} requer revisão.`,
    subject: () => 'PLACE — Pedido de revisão',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      let body = `A iniciativa "<b>${T}</b>" requer revisão.`;
      if (ctx.reason) body += `<br>Motivo: ${escapeHtml(ctx.reason)}`;
      return body;
    },
  },
  [EMAIL_EVENTS.EXECUTION_STARTED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => [{ email: ctx.initiative?.MentorEmail, name: ctx.initiative?.Mentor?.displayName || '' }],
    notificationTitle: (ctx) => `${ctx.initiative?.Title || ''} iniciou execução.`,
    subject: () => 'PLACE — Execução iniciada',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" iniciou execução.`;
    },
  },
  [EMAIL_EVENTS.SAVINGS_APPROVED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => [{ email: ctx.initiative?.MentorEmail, name: ctx.initiative?.Mentor?.displayName || '' }],
    notificationTitle: (ctx) => `${ctx.initiative?.Title || ''} - savings aprovados. Confirmação final pendente.`,
    subject: () => 'PLACE — Savings aprovados',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `Os savings da iniciativa "<b>${T}</b>" foram aprovados. Confirmação final pendente.`;
    },
  },
  [EMAIL_EVENTS.MENTOR_FINAL_VALIDATED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => [
      { email: ctx.initiative?.SubmittedByEmail, name: ctx.initiative?.SubmittedBy?.displayName || '' },
      { email: ctx.initiative?.GestorValidatorEmail, name: ctx.initiative?.GestorValidator?.displayName || '' },
    ],
    notificationTitle: () => 'Savings confirmados pelo mentor. Aguarda validação final.',
    subject: () => 'PLACE — Savings confirmados',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `Os savings da iniciativa "<b>${T}</b>" foram confirmados pelo mentor. Aguarda validação final.`;
    },
  },
  [EMAIL_EVENTS.IMPLEMENTED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => [
      { email: ctx.initiative?.SubmittedByEmail, name: ctx.initiative?.SubmittedBy?.displayName || '' },
      { email: ctx.initiative?.MentorEmail, name: ctx.initiative?.Mentor?.displayName || '' },
      { email: ctx.initiative?.GestorValidatorEmail, name: ctx.initiative?.GestorValidator?.displayName || '' },
    ],
    notificationTitle: () => 'Iniciativa marcada como implementada.',
    subject: () => 'PLACE — Iniciativa implementada',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" foi marcada como implementada.`;
    },
  },
  [EMAIL_EVENTS.GESTOR_TRANSFERRED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.recipients,
    notificationTitle: (ctx) => `${ctx.initiative?.Title || ''} transferido para si para validação.`,
    subject: () => 'PLACE — Iniciativa transferida para validação',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" foi transferida para si para validação.`;
    },
  },
  [EMAIL_EVENTS.GESTOR_CHANGED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => [{ email: ctx.initiative?.SubmittedByEmail, name: ctx.initiative?.SubmittedBy?.displayName || '' }],
    notificationTitle: (ctx) => `O gestor de ${ctx.initiative?.Title || ''} foi alterado.`,
    subject: () => 'PLACE — Gestor alterado',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `O gestor da iniciativa "<b>${T}</b>" foi alterado.`;
    },
  },
  [EMAIL_EVENTS.OWNERSHIP_TRANSFERRED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.recipients,
    notificationTitle: (ctx) => `${ctx.initiative?.Title || ''} transferido para si.`,
    subject: () => 'PLACE — Iniciativa transferida',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" foi transferida para si.`;
    },
  },
  [EMAIL_EVENTS.OWNER_CHANGED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => [{ email: ctx.initiative?.MentorEmail, name: ctx.initiative?.Mentor?.displayName || '' }],
    notificationTitle: (ctx) => `O proprietário de ${ctx.initiative?.Title || ''} foi alterado.`,
    subject: () => 'PLACE — Proprietário alterado',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `O proprietário da iniciativa "<b>${T}</b>" foi alterado.`;
    },
  },
  [EMAIL_EVENTS.ACCESS_GRANTED]: {
    type: NOTIFICATION_TYPE.COLLABORATION,
    to: (ctx) => ctx.recipients,
    notificationTitle: (ctx) => `${ctx.actorName || ''} concedeu-lhe acesso a ${ctx.initiative?.Title || ''}.`,
    subject: () => 'PLACE — Acesso concedido a uma iniciativa',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `${escapeHtml(ctx.actorName || '')} concedeu-lhe acesso à iniciativa "<b>${T}</b>".`;
    },
  },
  [EMAIL_EVENTS.ACCESS_REVOKED]: {
    type: NOTIFICATION_TYPE.COLLABORATION,
    to: (ctx) => ctx.recipients,
    notificationTitle: (ctx) => `${ctx.actorName || ''} removeu o seu acesso à iniciativa.`,
    subject: () => 'PLACE — Acesso removido',
    intro: (ctx) => {
      return `${escapeHtml(ctx.actorName || '')} removeu o seu acesso a uma iniciativa.`;
    },
  },
  [EMAIL_EVENTS.COMMENT_ADDED]: {
    type: NOTIFICATION_TYPE.COMMENT,
    to: (ctx) => [
      { email: ctx.initiative?.MentorEmail, name: ctx.initiative?.Mentor?.displayName || '' },
      { email: ctx.initiative?.SubmittedByEmail, name: ctx.initiative?.SubmittedBy?.displayName || '' },
    ],
    notificationTitle: (ctx) => `${ctx.actorName || ''} comentou ${ctx.initiative?.Title || ''}`,
    subject: () => 'PLACE — Novo comentário',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `${escapeHtml(ctx.actorName || '')} comentou a iniciativa "<b>${T}</b>".`;
    },
  },
};

export function createEmail(event, ctx = {}) {
  const tpl = EMAIL_TEMPLATES[event];
  if (!tpl) {
    throw new SystemError('UnknownEmailEvent', `No email template for event "${event}"`, { breaksFlow: false });
  }
  const initiativeUUID = ctx.initiativeUUID || (ctx.initiative && ctx.initiative.UUID);
  const recipients = normalizeRecipients(tpl.to(ctx), ctx.excludeEmail);
  const subject = tpl.subject(ctx);
  const notificationTitle = tpl.notificationTitle(ctx);
  const type = tpl.type;
  const pendingMentor = !!tpl.pendingMentor;

  return {
    event, recipients, subject, notificationTitle, type,
    async send() {
      const sent = [], failed = [];
      for (const r of recipients) {
        try {
          const body = renderBody(tpl.intro(ctx), pendingMentor, r.name);
          await sendEmail({ to: r.email, subject, body });
          await createNotificationRecord(initiativeUUID, r.email, notificationTitle, type);
          sent.push(r.email);
        } catch (err) {
          console.error(`[emails:${event}] send/notify failed for ${r.email}`, err);
          failed.push(r.email);
        }
      }
      return { sent, failed };
    },
  };
}
