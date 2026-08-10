const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const database = fs.readFileSync(path.join(root, 'js', 'supabase-config.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const migration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20260810080557_marketplace_search.sql'),
    'utf8'
);

test('search runs on form submission instead of filtering on every keystroke', () => {
    assert.match(index, /<form class="search-bar-global" id="globalSearchForm" role="search">/);
    assert.match(index, /اكتب ثم اضغط Enter للبحث/);
    assert.match(app, /globalSearchForm'\)\?\.addEventListener\('submit'/);
    assert.match(app, /searchInput\?\.addEventListener\('keydown'/);
    assert.match(app, /event\.key !== 'Enter'/);
    assert.doesNotMatch(app, /searchInput\.addEventListener\('input'/);
});

test('client searches the full marketplace through a paginated RPC', () => {
    assert.match(database, /async searchListings\(query, page = 0, pageSize = 30\)/);
    assert.match(database, /rpc\('search_marketplace_listings'/);
    assert.match(app, /await finnDB\.searchListings\(query, 0, this\.state\.listingsPageSize\)/);
    assert.match(app, /await finnDB\.searchListings\(this\.state\.searchQuery, nextPage/);
    assert.match(app, /items\.length === 1 \? 'نتيجة' : 'نتائج'/);
});

test('database search is fuzzy, ranked, RLS-aware, and narrowly granted', () => {
    assert.match(migration, /create extension if not exists pg_trgm with schema extensions/);
    assert.match(migration, /security invoker/);
    assert.match(migration, /listing\.status = 'active'/);
    assert.match(migration, /extensions\.word_similarity/);
    assert.match(migration, /order by search_rank desc, created_at desc/);
    assert.match(migration, /grant execute on function public\.search_marketplace_listings\(text, integer, integer\) to anon, authenticated/);
});
