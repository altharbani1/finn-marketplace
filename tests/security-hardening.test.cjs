const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migrationName = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
    .find((name) => name.endsWith('_specialist_security_hardening.sql'));
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', migrationName), 'utf8');
const headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');

test('profile PII is removed from broad SELECT and exposed only through authenticated RPCs', () => {
    assert.match(migration, /revoke select on public\.profiles from authenticated/i);
    assert.match(migration, /grant select \(id, full_name, avatar_url, rating, verified_seller, created_at\)/i);
    assert.match(migration, /create function public\.get_my_profile\(\)/i);
    assert.match(migration, /create function public\.get_listing_contact\(p_listing_id uuid\)/i);
    assert.match(migration, /create function public\.get_admin_profiles\(\)/i);
    assert.doesNotMatch(migration, /grant select \([^)]*phone_number[^)]*\)\s*on public\.profiles/i);
});

test('privileged RPCs use explicit authentication, empty search paths, and narrow execute grants', () => {
    for (const signature of [
        'get_listing_contact(uuid)',
        'get_admin_profiles()',
        'set_listing_status(uuid, public.listing_status)',
        'delete_listing_as_admin(uuid)',
        'upsert_seller_rating(uuid, uuid, smallint)'
    ]) {
        const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        assert.match(migration, new RegExp(`revoke all on function public\\.${escaped}[\\s\\S]*?from public, anon, authenticated`, 'i'));
        assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}[\\s\\S]*?to authenticated`, 'i'));
    }
    assert.ok((migration.match(/security definer/g) || []).length >= 6);
    assert.ok((migration.match(/set search_path = ''/g) || []).length >= 6);
    assert.match(migration, /where p\.id = caller_id and p\.role = 'admin'/i);
    assert.match(migration, /create function public\.is_marketplace_admin\(\)[\s\S]*security definer/i);
    assert.match(migration, /grant execute on function public\.is_marketplace_admin\(\) to authenticated/i);
    assert.ok((migration.match(/\(select public\.is_marketplace_admin\(\)\)/g) || []).length >= 7);
});

test('server-managed columns cannot be changed directly by marketplace clients', () => {
    assert.match(migration, /revoke update on public\.listings from authenticated/i);
    assert.match(migration, /revoke update \(status\) on public\.listings from authenticated/i);
    assert.doesNotMatch(migration, /grant update \([\s\S]*?\bstatus\b[\s\S]*?\) on public\.listings/i);
    assert.match(migration, /grant insert \(listing_id, user_id, comment_text\)/i);
    assert.match(migration, /grant insert \(listing_id, reporter_id, reason\)/i);
    assert.match(migration, /revoke update on public\.chat_threads from authenticated/i);
    assert.match(migration, /revoke update \(last_message, updated_at\) on public\.chat_threads from authenticated/i);
    assert.match(migration, /revoke insert \(listing_id, seller_id, reviewer_id, rating\)/i);
    assert.match(migration, /revoke update \(rating, updated_at\)/i);
    assert.match(migration, /on conflict \(listing_id, reviewer_id\)[\s\S]*do update set rating/i);
});

test('listing integrity constraints cover price, free listings, content length, and image count', () => {
    assert.match(migration, /constraint listings_price_nonnegative[\s\S]*price >= 0/i);
    assert.match(migration, /constraint listings_free_price_consistent[\s\S]*not is_free or price = 0/i);
    assert.match(migration, /constraint listings_title_length[\s\S]*between 2 and 180/i);
    assert.match(migration, /constraint listings_description_length[\s\S]*between 1 and 5000/i);
    assert.match(migration, /constraint listings_images_shape[\s\S]*jsonb_array_length\(images\) <= 15/i);
    assert.ok((migration.match(/not valid/gi) || []).length >= 5);
});

test('Netlify sends browser hardening headers compatible with the current static app', () => {
    assert.match(headers, /Content-Security-Policy:/i);
    assert.match(headers, /connect-src[^\n]*https:\/\/mjuaqlkddmgilmjehwlx\.supabase\.co/i);
    assert.match(headers, /frame-ancestors 'none'/i);
    assert.match(headers, /X-Content-Type-Options: nosniff/i);
    assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/i);
    assert.match(headers, /Permissions-Policy:/i);
});
