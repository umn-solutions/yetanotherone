/**
 * Single source of truth for all platform emails.
 *
 * To add an email:
 *  1. Add one key to EMAIL_EVENTS (value === key).
 *  2. Add one matching entry to EMAIL_TEMPLATES.
 *
 * send() sends email then, only on success per recipient, writes the bell record.
 * send() never throws -- failures are caught per-recipient, logged, and skipped.
 */

import { sendEmail, escapeHtml, SystemError } from '../libs/nofbiz/nofbiz.base.js';
import { createNotificationRecord } from './notifications-api.js';
import { APP_NAME } from './constants.js';

const NOTIFICATION_TYPE = {
  STATE_CHANGE: 'state_change',
  COLLABORATION: 'collaboration',
  COMMENT: 'comment',
};

export const EMAIL_EVENTS = {
  SUBMITTED: 'SUBMITTED',
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
    return base ? base + '/SitePages/index.html' : '';
  } catch (err) {
    console.warn('[emails] could not resolve app URL', err);
    return '';
  }
}

function renderBody(intro) {
  const link = getAppUrl();
  const cta = link ? `<p><a href="${link}">Aceder ao ${APP_NAME}</a></p>` : '';
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1f2933;line-height:1.5;">`
    + `<p>${intro}</p>${cta}`
    + `<hr style="border:none;border-top:1px solid #e4e7eb;margin:16px 0;">`
    + `<p style="font-size:12px;color:#7b8794;">Mensagem automática do ${APP_NAME}. Não responda a este email.</p>`
    + `</div>`;
}

function normalizeRecipients(to, excludeEmail) {
  const arr = Array.isArray(to) ? to : (to ? [to] : []);
  const seen = new Set();
  const out = [];
  for (const e of arr) {
    if (!e) continue;
    if (excludeEmail && e === excludeEmail) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

const EMAIL_TEMPLATES = {
  [EMAIL_EVENTS.SUBMITTED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.initiative?.MentorEmail,
    notificationTitle: (ctx) => `${ctx.initiative?.Title} submetido para validação.`,
    subject: () => 'PLACE — Nova iniciativa submetida para validação',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" foi submetida e aguarda a sua validação.`;
    },
  },
  [EMAIL_EVENTS.RESUBMITTED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.initiative?.MentorEmail,
    notificationTitle: (ctx) => `${ctx.initiative?.Title} re-submetido.`,
    subject: () => 'PLACE — Iniciativa re-submetida',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" foi re-submetida após revisão.`;
    },
  },
  [EMAIL_EVENTS.SAVINGS_VALIDATION_REQUESTED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.gestorEmail || ctx.initiative?.GestorValidatorEmail,
    notificationTitle: (ctx) => `${ctx.initiative?.Title} requer validação de savings.`,
    subject: () => 'PLACE — Validação de savings pendente',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" requer a sua validação de savings.`;
    },
  },
  [EMAIL_EVENTS.CANCELLED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.initiative?.MentorEmail,
    notificationTitle: (ctx) => `${ctx.initiative?.Title} foi cancelado.`,
    subject: () => 'PLACE — Iniciativa cancelada',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" foi cancelada.`;
    },
  },
  [EMAIL_EVENTS.DELETED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.recipients,
    notificationTitle: (ctx) => `${ctx.actorName} eliminou ${ctx.initiative?.Title || 'uma iniciativa'}.`,
    subject: () => 'PLACE — Iniciativa eliminada',
    intro: (ctx) => {
      return `${escapeHtml(ctx.actorName || '')} eliminou a iniciativa "<b>${escapeHtml(ctx.initiative?.Title || 'uma iniciativa')}</b>".`;
    },
  },
  [EMAIL_EVENTS.MENTOR_APPROVED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.initiative?.SubmittedByEmail,
    notificationTitle: () => 'Sua iniciativa foi aprovada pelo mentor.',
    subject: () => 'PLACE — Iniciativa aprovada pelo mentor',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A sua iniciativa "<b>${T}</b>" foi aprovada pelo mentor.`;
    },
  },
  [EMAIL_EVENTS.REJECTED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.initiative?.SubmittedByEmail,
    notificationTitle: (ctx) => `${ctx.initiative?.Title} foi rejeitado.`,
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
    to: (ctx) => ctx.initiative?.SubmittedByEmail,
    notificationTitle: (ctx) => `${ctx.initiative?.Title} requer revisão.`,
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
    to: (ctx) => ctx.initiative?.MentorEmail,
    notificationTitle: (ctx) => `${ctx.initiative?.Title} iniciou execução.`,
    subject: () => 'PLACE — Execução iniciada',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" iniciou execução.`;
    },
  },
  [EMAIL_EVENTS.SAVINGS_APPROVED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.initiative?.MentorEmail,
    notificationTitle: (ctx) => `${ctx.initiative?.Title} - savings aprovados. Confirmação final pendente.`,
    subject: () => 'PLACE — Savings aprovados',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `Os savings da iniciativa "<b>${T}</b>" foram aprovados. Confirmação final pendente.`;
    },
  },
  [EMAIL_EVENTS.MENTOR_FINAL_VALIDATED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => [ctx.initiative?.SubmittedByEmail, ctx.initiative?.GestorValidatorEmail],
    notificationTitle: () => 'Savings confirmados pelo mentor. Aguarda validação final.',
    subject: () => 'PLACE — Savings confirmados',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `Os savings da iniciativa "<b>${T}</b>" foram confirmados pelo mentor. Aguarda validação final.`;
    },
  },
  [EMAIL_EVENTS.IMPLEMENTED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => [ctx.initiative?.SubmittedByEmail, ctx.initiative?.MentorEmail, ctx.initiative?.GestorValidatorEmail],
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
    notificationTitle: (ctx) => `${ctx.initiative?.Title} transferido para si para validação.`,
    subject: () => 'PLACE — Iniciativa transferida para validação',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" foi transferida para si para validação.`;
    },
  },
  [EMAIL_EVENTS.GESTOR_CHANGED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.initiative?.SubmittedByEmail,
    notificationTitle: (ctx) => `O gestor de ${ctx.initiative?.Title} foi alterado.`,
    subject: () => 'PLACE — Gestor alterado',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `O gestor da iniciativa "<b>${T}</b>" foi alterado.`;
    },
  },
  [EMAIL_EVENTS.OWNERSHIP_TRANSFERRED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.recipients,
    notificationTitle: (ctx) => `${ctx.initiative?.Title} transferido para si.`,
    subject: () => 'PLACE — Iniciativa transferida',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `A iniciativa "<b>${T}</b>" foi transferida para si.`;
    },
  },
  [EMAIL_EVENTS.OWNER_CHANGED]: {
    type: NOTIFICATION_TYPE.STATE_CHANGE,
    to: (ctx) => ctx.initiative?.MentorEmail,
    notificationTitle: (ctx) => `O proprietário de ${ctx.initiative?.Title} foi alterado.`,
    subject: () => 'PLACE — Proprietário alterado',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `O proprietário da iniciativa "<b>${T}</b>" foi alterado.`;
    },
  },
  [EMAIL_EVENTS.ACCESS_GRANTED]: {
    type: NOTIFICATION_TYPE.COLLABORATION,
    to: (ctx) => ctx.recipients,
    notificationTitle: (ctx) => `${ctx.actorName} concedeu-lhe acesso a ${ctx.initiative?.Title}.`,
    subject: () => 'PLACE — Acesso concedido a uma iniciativa',
    intro: (ctx) => {
      const T = escapeHtml(ctx.initiative?.Title || '');
      return `${escapeHtml(ctx.actorName || '')} concedeu-lhe acesso à iniciativa "<b>${T}</b>".`;
    },
  },
  [EMAIL_EVENTS.ACCESS_REVOKED]: {
    type: NOTIFICATION_TYPE.COLLABORATION,
    to: (ctx) => ctx.recipients,
    notificationTitle: (ctx) => `${ctx.actorName} removeu o seu acesso à iniciativa.`,
    subject: () => 'PLACE — Acesso removido',
    intro: (ctx) => {
      return `${escapeHtml(ctx.actorName || '')} removeu o seu acesso a uma iniciativa.`;
    },
  },
  [EMAIL_EVENTS.COMMENT_ADDED]: {
    type: NOTIFICATION_TYPE.COMMENT,
    to: (ctx) => [ctx.initiative?.MentorEmail, ctx.initiative?.SubmittedByEmail],
    notificationTitle: (ctx) => `${ctx.actorName} comentou ${ctx.initiative?.Title}`,
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
  const body = renderBody(tpl.intro(ctx));
  const notificationTitle = tpl.notificationTitle(ctx);
  const type = tpl.type;
  return {
    event, recipients, subject, body, notificationTitle, type,
    async send() {
      const sent = [], failed = [];
      for (const email of recipients) {
        try {
          await sendEmail({ to: email, subject, body });
          await createNotificationRecord(initiativeUUID, email, notificationTitle, type);
          sent.push(email);
        } catch (err) {
          console.error(`[emails:${event}] send/notify failed for ${email}`, err);
          failed.push(email);
        }
      }
      return { sent, failed };
    },
  };
}
