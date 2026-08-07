const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('account deletion data is private and only callable through narrow RPCs', () => {
    const migration = read('supabase/migrations/20260807190907_account_deletion_requests.sql');
    assert.match(migration, /enable row level security/);
    assert.match(migration, /revoke all on public\.account_deletion_requests from public, anon, authenticated/);
    assert.match(migration, /security definer\s+set search_path = ''/);
    assert.match(migration, /grant execute on function public\.request_account_deletion\(text\) to authenticated/);
    assert.match(migration, /role = 'admin'/);
});

test('terms acceptance is recorded server-side without trusting malformed dates', () => {
    const migration = read('supabase/migrations/20260807190907_account_deletion_requests.sql');
    assert.match(migration, /create table if not exists public\.terms_acceptances/);
    assert.match(migration, /record_terms_acceptance_after_signup on auth\.users/);
    assert.match(migration, /accepted_at', ''\) ~[\s\S]*\^\\d\{4\}-\\d\{2\}/);
});

test('account deletion edge function verifies caller admin and storage cleanup', () => {
    const edge = read('supabase/functions/process-account-deletion/index.ts');
    assert.match(edge, /userClient\.auth\.getUser\(token\)/);
    assert.match(edge, /caller\?\.role !== 'admin'/);
    assert.match(edge, /auth\.admin\.deleteUser\(targetUserId\)/);
    assert.match(edge, /listingStorageError/);
    assert.match(edge, /avatarStorageError/);
    assert.doesNotMatch(edge, /service[_-]?role[^\n]*['"][A-Za-z0-9_-]{20,}/i);
});

test('contact and data-rights form is statically discoverable by Netlify', () => {
    const contact = read('contact.html');
    assert.match(contact, /name="contact-and-rights"/);
    assert.match(contact, /data-netlify="true"/);
    assert.match(contact, /netlify-honeypot="bot-field"/);
    assert.match(contact, /name="form-name" value="contact-and-rights"/);
    assert.match(contact, /action="\/thank-you"/);
});

test('Supabase browser client is pinned with the verified CDN integrity hash', () => {
    const expected = 'integrity="sha384-fPWur1rx/DE6YtXP/x0MD6dd90RgnVsz5yX/DIg7CcVAnTBZsENWuIcpvVTM39ti"';
    for (const file of ['index.html', 'listing.html', 'profile.html', 'admin.html']) {
        const html = read(file);
        assert.match(html, /@supabase\/supabase-js@2\.111\.0/);
        assert.ok(html.includes(expected), `${file} must pin the live CDN SRI hash`);
        assert.match(html, /crossorigin="anonymous"/);
    }
});
