const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const index = read('index.html');
const app = read('js/app.js');

test('upper navigation and blue hero categories share one taxonomy source', () => {
    assert.match(index, /id="catNavList"/);
    assert.match(index, /id="heroTags"/);
    assert.doesNotMatch(index, /hero-tag-btn[^>]+data-cat=/);
    assert.match(app, /catNav\.innerHTML = INITIAL_CATEGORIES\.map/);
    assert.match(app, /heroTags\.innerHTML = INITIAL_CATEGORIES\.map/);
});

test('both category areas use the same delegated selection behavior', () => {
    assert.match(app, /const handleCategorySelection = \(e\) =>/);
    assert.match(app, /getElementById\('catNavList'\).*handleCategorySelection/);
    assert.match(app, /getElementById\('heroTags'\).*handleCategorySelection/);
});
