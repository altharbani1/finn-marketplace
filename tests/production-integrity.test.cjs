const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const appSource = read('js/app.js');
const databaseSource = read('js/supabase-config.js');
const listingSource = read('listing.html');
const adminSource = read('admin.html');
const profileSource = read('profile.html');
const communicationMigration = read('supabase/migrations/20260802052237_enable_marketplace_communication_ratings_reports.sql');

test('listing questions use Supabase comments instead of fabricated local data', () => {
    assert.match(databaseSource, /from\('comments'\)/);
    assert.match(listingSource, /getListingComments/);
    assert.match(listingSource, /addComment/);
    assert.doesNotMatch(listingSource, /خالد المطيري/);
    assert.doesNotMatch(listingSource, /finn_marketplace_listings_real_prod_v6/);
});

test('production UI does not advertise placeholder chat or fake server ratings', () => {
    assert.doesNotMatch(appSource, /openChatForListing\('list-101'\)/);
    assert.doesNotMatch(databaseSource, /getChats\(\) \{ return \[\]; \}/);
    assert.doesNotMatch(listingSource, /حفظ التقييم حقيقياً في السيرفر/);
});

test('admin dashboard loads real profiles and contains no seeded fake users', () => {
    assert.match(databaseSource, /getAdminProfiles/);
    assert.match(adminSource, /finnDB\.getAdminProfiles\(\)/);
    assert.doesNotMatch(adminSource, /usr-[1-4]/);
    assert.doesNotMatch(adminSource, />142</);
});

test('signed-in favorites persist in Supabase and profile status is truthful', () => {
    assert.match(databaseSource, /from\('favorites'\)/);
    assert.match(databaseSource, /async syncFavorites\(\)/);
    assert.match(appSource, /await finnDB\.syncFavorites\(\)/);
    assert.doesNotMatch(profileSource, /5\.0 ★/);
    assert.match(profileSource, /currentUser\.verified \? 'هوية موثقة' : 'حساب مسجل'/);
});

test('private chats are backed by participant-scoped Supabase tables', () => {
    assert.match(databaseSource, /async getChatThreads\(\)/);
    assert.match(databaseSource, /from\('chat_threads'\)/);
    assert.match(databaseSource, /from\('messages'\)/);
    assert.match(appSource, /async openChatsModal/);
    assert.match(communicationMigration, /buyer_id <> seller_id/);
    assert.match(communicationMigration, /Buyers create listing threads/);
});

test('seller ratings and reports have real storage and protected policies', () => {
    assert.match(communicationMigration, /create table if not exists public\.seller_ratings/);
    assert.match(communicationMigration, /seller_ratings_no_self_rating/);
    assert.match(communicationMigration, /refresh_seller_rating_after_change/);
    assert.match(databaseSource, /async rateSeller/);
    assert.match(databaseSource, /async submitReport/);
    assert.match(databaseSource, /async getAdminReports/);
    assert.match(adminSource, /renderReports\(\)/);
    assert.doesNotMatch(adminSource, /إدارة البلاغات قيد التجهيز/);
});
