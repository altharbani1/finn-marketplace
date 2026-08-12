const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('homepage cache-busts the category renderer and current visual theme', () => {
    assert.match(index, /css\/main\.css\?v=14\.0/);
    assert.match(index, /js\/app\.js\?v=21\.0/);
    assert.doesNotMatch(index, /js\/app\.js\?v=20\.0/);
});
