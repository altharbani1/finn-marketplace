const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'main.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

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
