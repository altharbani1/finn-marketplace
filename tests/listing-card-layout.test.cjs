const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/main.css');
const profile = read('profile.html');
const database = read('js/supabase-config.js');
const migration = read('supabase/migrations/20260812070357_public_listing_seller_names.sql');

test('listing cards reserve one consistent desktop and mobile footprint', () => {
    assert.match(css, /\.listings-grid\.list-view \.listing-card \{[\s\S]*?height: 166px;[\s\S]*?min-height: 166px;/);
    assert.match(css, /\.listings-grid\.list-view \.listing-thumb-wrap \{[\s\S]*?width: 220px;[\s\S]*?height: 100%;/);
    assert.match(css, /aspect-ratio: 16 \/ 9;/);
    assert.match(css, /\.listings-grid\.list-view \.listing-body \{[\s\S]*?height: 168px;[\s\S]*?flex: 0 0 168px;/);
    assert.match(css, /object-fit: cover;[\s\S]*?object-position: center;/);
});

test('listing image area contains no text overlays', () => {
    const imageBlock = app.match(/<div class="listing-thumb-wrap">([\s\S]*?)<\/div>\s*<div class="listing-body">/);

    assert.ok(imageBlock, 'listing image block should exist');
    assert.doesNotMatch(imageBlock[1], /badge-tag|no-image-badge|<span/);
    assert.match(app, /badge-tag listing-card-category/);
    assert.match(css, /\.listing-card \.listing-card-category \{\s*position: static;/);
});

test('public listing cards show seller, city and left-aligned date without price', () => {
    const cardTemplate = app.slice(app.indexOf('<article class="listing-card"'), app.indexOf('</article>', app.indexOf('<article class="listing-card"')));
    assert.match(cardTemplate, /listing-seller-name/);
    assert.match(cardTemplate, /listing-location-tag/);
    assert.match(cardTemplate, /listing-published-date/);
    assert.doesNotMatch(cardTemplate, /formattedPrice|listing-price-tag/);
});

test('profile listing cards no longer expose price outside the detail page', () => {
    assert.doesNotMatch(profile, /listing-price-tag/);
    assert.match(profile, /listing-seller-name/);
    assert.match(profile, /listing-location-tag/);
});

test('seller display names are loaded through a narrow public RPC', () => {
    assert.match(database, /attachPublicSellerNames/);
    assert.match(database, /get_public_listing_sellers/);
    assert.match(migration, /where listing\.status = 'active'/);
    assert.doesNotMatch(migration, /phone_number|email|role/);
});
