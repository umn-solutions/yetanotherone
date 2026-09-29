import { spGET, spMERGE, spPOST } from '../app/libs/nofbiz/nofbiz.base.js'
import { log } from './log.js'
import { loadJSOM, execQuery } from './jsom.js'

export async function setQuickEdit(listName, enabled) {
  const url = `${_spPageContextInfo.webAbsoluteUrl}/_api/web/lists/getbytitle('${listName}')/DefaultView`;
  try {
    await spMERGE(url, {
      headers: { 'IF-MATCH': '*' },
      data: { __metadata: { type: 'SP.View' }, TabularView: enabled },
    });
    log(`  [view] Quick edit ${enabled ? 'enabled' : 'disabled'} on ${listName}`);
  } catch (e) {
    console.error('[views.setQuickEdit]', { listName, enabled, err: e });
    log(`  [view] ! Failed to ${enabled ? 'enable' : 'disable'} quick edit -- ` + (e.message || 'failed'), 'error');
  }
}

// Redirect the list's New/Edit forms to the app via the content type's form
// URLs. list.DefaultNewFormUrl cannot do this (read-only over REST; only
// accepts the list's own SPForms) -- ContentType.NewFormUrl/EditFormUrl is the
// writable redirect knob and requires JSOM. See setup/jsom.js.
export async function setFormsRedirect(listName, redirect, appUrl) {
  const target = redirect ? appUrl : '';
  try {
    await loadJSOM();
    const ctx = SP.ClientContext.get_current();
    const cts = ctx.get_web().get_lists().getByTitle(listName).get_contentTypes();
    ctx.load(cts);
    await execQuery(ctx);
    if (cts.get_count() === 0) throw new Error('list has no content types');

    const ct = cts.itemAt(0); // primary/default content type
    ct.set_newFormUrl(target);
    ct.set_editFormUrl(target);
    ct.update(false); // false = do not push to child content types
    await execQuery(ctx);
    log(`  [forms] ${redirect ? 'Redirected New/Edit forms to app' : 'Restored default New/Edit forms'} on ${listName}`);
  } catch (e) {
    console.error('[views.setFormsRedirect]', { listName, redirect, err: e });
    log(`  [forms] ! Failed to ${redirect ? 'redirect' : 'restore'} forms -- ` + (e.message || 'failed'), 'error');
  }
}

export async function ensureAdminView(listName) {
  const base = `${_spPageContextInfo.webAbsoluteUrl}/_api/web/lists/getbytitle('${listName}')`;
  try {
    await spGET(`${base}/views/getbytitle('Admin')`);
  } catch (e) {
    if (e.status && e.status !== 404) throw e;
    await spPOST(`${base}/views`, { data: { Title: 'Admin', PersonalView: true, TabularView: true } });
    log('  [view] Created Admin view');
  }
}

export async function addFieldToAdminView(listName, fieldName) {
  const url = `${_spPageContextInfo.webAbsoluteUrl}/_api/web/lists/getbytitle('${listName}')/views/getbytitle('Admin')/ViewFields/addviewfield('${fieldName}')`;
  try {
    await spPOST(url);
    log('  [view] + ' + fieldName);
  } catch (e) {
    log('  [view] ! ' + fieldName + ' -- ' + (e.message || 'failed'), 'error');
  }
}
