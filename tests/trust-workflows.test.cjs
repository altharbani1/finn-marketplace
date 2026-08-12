const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('supabase/migrations/20260812061334_professional_trust_ratings_reports.sql');
const database = read('js/supabase-config.js');
const listing = read('listing.html');
const admin = read('js/admin.js');
const adminHtml = read('admin.html');

test('rating history is retained while one current rating per seller and reviewer is enforced', () => {
    assert.match(migration, /add column if not exists is_current boolean not null default true/);
    assert.match(migration, /row_number\(\) over[\s\S]+partition by seller_id, reviewer_id/);
    assert.match(migration, /seller_ratings_one_current_per_pair[\s\S]+where is_current/);
    assert.match(migration, /set is_current = false[\s\S]+insert into public\.seller_ratings/);
    assert.match(migration, /review_text text/);
    assert.match(migration, /seller_reply text/);
});

test('ratings require a real message or comment and are rate limited atomically', () => {
    assert.match(migration, /public\.comments c join public\.listings/);
    assert.match(migration, /public\.messages m join public\.chat_threads/);
    assert.doesNotMatch(migration, /exists \([\s\S]{0,120}from public\.chat_threads[^\s\S]*\)/);
    assert.match(migration, /trust_action_log/);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /Rating rate limit exceeded/);
    assert.match(migration, /revoke insert, update, delete on public\.seller_ratings from authenticated/);
});

test('rating summary provides aggregate distribution, reviews, replies, and abuse reporting', () => {
    assert.match(migration, /get_seller_rating_summary/);
    assert.match(migration, /'distribution'/);
    assert.match(database, /async replyToSellerRating/);
    assert.match(database, /async submitRatingReport/);
    assert.match(listing, /رد المعلن:/);
    assert.match(listing, /إبلاغ عن التقييم/);
});

test('reports have taxonomy, strict HTTPS evidence, priority, duplicate prevention, and privacy-safe notifications', () => {
    assert.match(migration, /'fraud','prohibited','misleading','duplicate','abuse','spam','privacy','other'/);
    assert.match(migration, /valid_https_evidence/);
    assert.match(migration, /jsonb_array_length\(p_urls\) <= 3/);
    assert.match(migration, /char_length\(item #>> '\{\}'\) > 500/);
    assert.match(migration, /!~ '\^https:\/\//);
    assert.match(migration, /reports_one_open_listing_per_reporter/);
    assert.match(migration, /reports_one_open_rating_per_reporter/);
    assert.match(migration, /duplicate_open/);
    assert.match(migration, /Report rate limit exceeded/);
    assert.match(migration, /دون مشاركة هويتك/);
    assert.doesNotMatch(migration, /trust_notifications[\s\S]{0,300}reporter_name/);
});

test('moderation workflow is searchable, conflict-aware, audited, and can hide an abusive rating', () => {
    assert.match(migration, /p_search text default null/);
    assert.match(migration, /order by priority desc,created_at asc/);
    assert.match(migration, /where id=p_report_id and status=p_expected_status/);
    assert.match(migration, /'report\.status_changed'/);
    assert.match(migration, /hidden_at=now\(\),hidden_by=caller_id/);
    assert.match(adminHtml, /reportsTargetFilter/);
    assert.match(adminHtml, /reportsCategoryFilter/);
    assert.match(adminHtml, /reportsPriorityFilter/);
});
