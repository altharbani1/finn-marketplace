const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const indexSource = read('index.html');
const appSource = read('js/app.js');
const mainStyles = read('css/main.css');
const databaseSource = read('js/supabase-config.js');
const listingSource = read('listing.html');
const adminSource = read('admin.html');
const adminScript = read('js/admin.js');
const profileSource = read('profile.html');
const communicationMigration = read('supabase/migrations/20260802052237_enable_marketplace_communication_ratings_reports.sql');
const avatarMigration = read('supabase/migrations/20260802112000_enable_profile_avatar_storage.sql');

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
    assert.match(databaseSource, /getAdminProfilesPage/);
    assert.match(adminScript, /finnDB\.getAdminProfilesPage\(adminState\.users\)/);
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

test('signed-in user menu exposes the four account destinations', () => {
    assert.match(appSource, /profile\.html\?tab=myAds/);
    assert.match(appSource, /profile\.html\?tab=favs/);
    assert.match(appSource, /profile\.html\?tab=settings/);
    assert.match(appSource, />تسجيل خروج</);
    assert.match(appSource, /aria-haspopup="menu"/);
    assert.match(appSource, /closeAccountMenu/);
    assert.match(profileSource, /URLSearchParams\(window\.location\.search\)\.get\('tab'\)/);
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
    assert.match(adminScript, /async function loadReports\(\)/);
    assert.match(adminScript, /data-status="in_review"/);
    assert.match(adminScript, /data-status="resolved"/);
    assert.doesNotMatch(adminSource, /إدارة البلاغات قيد التجهيز/);
});

test('marketplace uses text search and a permanent list layout', () => {
    assert.match(indexSource, /id="globalSearch"/);
    assert.doesNotMatch(indexSource, /class="filter-sidebar"/);
    assert.doesNotMatch(indexSource, /id="filterCity"|id="minPrice"|id="maxPrice"|id="filterCondition"/);
    assert.doesNotMatch(indexSource, /id="viewGridBtn"|id="viewListBtn"|id="sortBy"/);
    assert.match(appSource, /feedContainer\.className = 'listings-grid list-view'/);
    assert.match(appSource, /item\.subCategory/);
    assert.match(appSource, /item\.city/);
    assert.match(mainStyles, /\.listings-grid\.list-view \.listing-card/);
});

test('seller contact and profile avatar uploads are production-backed', () => {
    assert.match(listingSource, /إظهار رقم المعلن/);
    assert.match(listingSource, /https:\/\/wa\.me\//);
    assert.match(listingSource, /rel="noopener noreferrer"/);
    assert.match(profileSource, /id="editAvatarFile"/);
    assert.match(databaseSource, /from\('profile-avatars'\)/);
    assert.match(databaseSource, /avatarFile/);
    assert.match(avatarMigration, /'profile-avatars'/);
    assert.match(avatarMigration, /Owners upload avatar objects/);
    assert.match(avatarMigration, /storage\.foldername\(name\)/);
});
