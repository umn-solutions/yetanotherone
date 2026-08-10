/**
 * Standalone email template test harness.
 *
 * Fires EVERY platform email template (all EMAIL_EVENTS) at a fixed list of
 * target addresses so you can eyeball the rendered emails in a real inbox.
 *
 * It reuses the production `createEmail(event, ctx).send()` factory verbatim --
 * the same code path the app uses -- so what you receive is exactly what users
 * get. Nothing here duplicates template/body logic.
 *
 * ---------------------------------------------------------------------------
 * HOW IT WORKS
 * ---------------------------------------------------------------------------
 * A single dummy initiative + ctx is built per target with EVERY recipient
 * field (SubmittedByEmail, MentorEmail, GestorValidatorEmail, ctx.recipients,
 * ctx.gestor, ctx.actor) pointed at that one target. So every template's
 * to(ctx) resolves to the target, deduped to one email each. Result: each
 * target receives one copy of all 21 templates.
 *   Total emails sent = EMAIL_TARGETS.length x events.length
 *
 * ---------------------------------------------------------------------------
 * HOW TO RUN
 * ---------------------------------------------------------------------------
 * This MUST run inside the live app page (Edge, logged in). `sendEmail` POSTs
 * to SharePoint's REST endpoint and needs `_spPageContextInfo` + a request
 * digest -- it will NOT work from Node or a bare HTML file.
 *
 * 1. Fill EMAIL_TARGETS below with real addresses.
 * 2. Open the app (SitePages/app.aspx) in Edge, logged in.
 * 3. Temporarily add this line to app/index.js and reload:
 *        import './utils/emails-test-harness.js';
 *    (or in the console:  await import('./SiteAssets/app/utils/emails-test-harness.js')
 *     with a path relative to the page URL)
 * 4. In the console run:
 *        PLACE_EMAIL_TEST.run()                 // send everything
 *        PLACE_EMAIL_TEST.run({ dryRun: true }) // preview recipients/subjects, send nothing
 *        PLACE_EMAIL_TEST.run({ only: 'IMPLEMENTED' })          // one template
 *        PLACE_EMAIL_TEST.run({ events: ['REJECTED','CANCELLED'] }) // a subset
 * 5. Remove the temporary import when done.
 *
 * ---------------------------------------------------------------------------
 * SIDE EFFECT -- Notifications list
 * ---------------------------------------------------------------------------
 * `.send()` writes one bell-notification record to the Notifications SP list
 * per successful recipient. Every record created here carries
 * InitiativeUUID === DUMMY_UUID, so they are trivial to find and purge:
 *   SPInterceptor.store.lists.Notifications (offline) or a CAML filter on
 *   InitiativeUUID === the value logged at startup.
 */

import { createEmail, EMAIL_EVENTS } from './emails.js';

// ===========================================================================
// EDIT THIS: recipient addresses (string array). Every address receives the
// full set of templates.
// ===========================================================================
export const EMAIL_TARGETS = [
  // 'you@example.com',
  // 'colleague@example.com',
];

// Stable dummy UUID so all Notifications records from this harness are greppable.
const DUMMY_UUID = 'TEST-EMAIL-HARNESS-0000-0000-000000000000';

const DUMMY_TITLE = 'TESTE - Iniciativa Dummy (Harness de Emails)';

/**
 * Valid financials payload so the IMPLEMENTED template renders its table
 * instead of the "sem dados" fallback.
 * gastos: asIs 1000x5 = 5000/mes, toBe 1000x3 = 3000/mes -> 2000/mes saving.
 * Mensal factor 12 -> 24.000 EUR annualizado.
 */
const DUMMY_FINANCIALS = {
  TimePeriod: 'Mensal',
  FTEAnnualCost: '30000',
  SavingType: 'Hard Cost',
  SavingCategory: ['Gastos Gerais'],
  EnabledCategories: ['gastos'],
  GastosGeraisData: {
    asIs: { v: 1000, c: 5 },
    toBe: { v: 1000, c: 3 },
  },
};

/** Derives a display name from an email local part (e.g. john.doe@x -> John Doe). */
function nameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || email;
}

/**
 * Builds one ctx whose every recipient-yielding field points at `email`,
 * so all templates route to that single target.
 * @param {string} email
 */
function buildCtx(email) {
  const name = nameFromEmail(email);
  const person = { email, name, displayName: name };
  const initiative = {
    UUID: DUMMY_UUID,
    Title: DUMMY_TITLE,
    SubmittedByEmail: email,
    SubmittedBy: { displayName: name },
    MentorEmail: email,
    Mentor: { displayName: name },
    GestorValidatorEmail: email,
    GestorValidator: { displayName: name },
  };
  return {
    initiative,
    ownerName: name,
    dataHora: '10/08/2026 14:30',
    recipients: [{ email, name }],
    gestor: person,
    actor: person,
    actorName: name,
    reason: 'Motivo de teste para validacao do template de email.',
    financials: DUMMY_FINANCIALS,
    // no excludeEmail -- we want the target to receive everything
  };
}

/**
 * Resolves which events to fire from run() options.
 * @param {{ only?: string, events?: string[] }} opts
 * @returns {string[]}
 */
function resolveEvents(opts) {
  if (opts.only) return [opts.only];
  if (Array.isArray(opts.events) && opts.events.length) return opts.events;
  return Object.keys(EMAIL_EVENTS);
}

/**
 * Fires the selected templates at every EMAIL_TARGETS address.
 * @param {{ dryRun?: boolean, only?: string, events?: string[] }} [opts]
 * @returns {Promise<{ sent: string[], failed: string[], skipped: string[] }>}
 */
export async function run(opts = {}) {
  const summary = { sent: [], failed: [], skipped: [] };

  if (!EMAIL_TARGETS.length) {
    console.warn('[emails-test-harness] EMAIL_TARGETS is empty -- add addresses before running.');
    return summary;
  }

  const events = resolveEvents(opts);
  const unknown = events.filter((e) => !EMAIL_EVENTS[e]);
  if (unknown.length) {
    console.error('[emails-test-harness] unknown event(s):', unknown, '-- valid:', Object.keys(EMAIL_EVENTS));
    return summary;
  }

  console.log(
    `[emails-test-harness] ${opts.dryRun ? 'DRY RUN' : 'SENDING'} | targets=${EMAIL_TARGETS.length}`
    + ` | events=${events.length} | InitiativeUUID=${DUMMY_UUID}`
  );

  // event-outer, target-inner: each template is fired at the WHOLE list.
  for (const event of events) {
    console.group(`[emails-test-harness] ${event} -> ${EMAIL_TARGETS.length} target(s)`);
    for (const email of EMAIL_TARGETS) {
      const key = `${event} -> ${email}`;
      try {
        const mail = createEmail(EMAIL_EVENTS[event], buildCtx(email));
        if (opts.dryRun) {
          console.log(`[dry] ${email}`, {
            recipients: mail.recipients.map((r) => r.email),
            subject: mail.subject,
            notificationTitle: mail.notificationTitle,
          });
          summary.skipped.push(key);
          continue;
        }
        const res = await mail.send(); // logs body per recipient, writes bell record
        if (res.failed.length) summary.failed.push(key);
        else summary.sent.push(key);
      } catch (err) {
        console.error(`[emails-test-harness] ${event} failed for ${email}`, err);
        summary.failed.push(key);
      }
    }
    console.groupEnd();
  }

  console.log('[emails-test-harness] done.', {
    sent: summary.sent.length,
    failed: summary.failed.length,
    skipped: summary.skipped.length,
  });
  if (summary.failed.length) console.warn('[emails-test-harness] failures:', summary.failed);
  return summary;
}

// Expose on window for console-driven runs.
if (typeof window !== 'undefined') {
  window.PLACE_EMAIL_TEST = { run, EMAIL_TARGETS, EMAIL_EVENTS, DUMMY_UUID };
}
