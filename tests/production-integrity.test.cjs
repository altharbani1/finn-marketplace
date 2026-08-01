const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const appSource = read('js/app.js');
const databaseSource = read('js/supabase-config.js');
const listingSource = read('listing.html');
const adminSource = read('admin.html');

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
