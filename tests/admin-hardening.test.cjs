const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('admin reads are paginated and each tab is loaded lazily', () => {
    const db = read('js/supabase-config.js');
    const admin = read('js/admin.js');
    assert.match(db, /get_admin_listings_page/);
    assert.match(db, /get_admin_profiles_page/);
    assert.match(db, /get_admin_reports_page/);
    assert.match(db, /get_admin_deletion_requests_page/);
    assert.match(admin, /adminState\.loaded\.has\(tab\)/);
    assert.doesNotMatch(admin, /getAdminListings\(\)/);
});

test('administrator mutations are atomic, audited, and conflict-aware', () => {
    const sql = read('supabase/migrations/20260811075938_harden_admin_operations.sql');
    assert.match(sql, /create table if not exists public\.admin_audit_log/);
    assert.match(sql, /where id = p_report_id and status = p_expected_status/);
    assert.match(sql, /The last administrator cannot be demoted/);
    assert.match(sql, /grant execute on function public\.admin_update_profile[\s\S]+to authenticated/);
    assert.match(sql, /revoke all on public\.admin_audit_log from public, anon, authenticated/);
});

test('account deletion uses a single-worker claim and persistent failure state', () => {
    const sql = read('supabase/migrations/20260811075938_harden_admin_operations.sql');
    const edge = read('supabase/functions/process-account-deletion/index.ts');
    assert.match(sql, /where r\.id = p_request_id and r\.user_id is not null and r\.status in \('pending','failed'\)/);
    assert.match(edge, /claim_account_deletion_request/);
    assert.match(edge, /complete_account_deletion_request/);
    assert.match(edge, /fail_account_deletion_request/);
    assert.doesNotMatch(edge, /update\(\{ status: 'pending'/);
});

test('admin page has semantic tabs, no inline script, and a stricter CSP', () => {
    const html = read('admin.html');
    const headers = read('_headers');
    assert.match(html, /role="tablist"/);
    assert.match(html, /role="tabpanel"/);
    const inlineScripts = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
        .filter(match => !/\ssrc=/i.test(match[1] || ''))
        .filter(match => match[2].trim());
    assert.equal(inlineScripts.length, 0);
    const adminHeaders = headers.split('/admin.html')[1] || '';
    assert.match(adminHeaders, /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
    assert.doesNotMatch(adminHeaders, /script-src[^;]*'unsafe-inline'/);
});
