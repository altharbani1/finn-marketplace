const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const dataSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
const categoriesSource = dataSource.match(/const INITIAL_CATEGORIES = (\[[\s\S]*?\n\]);/);
const migrationSource = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260801085714_expand_listing_categories.sql'),
    'utf8'
);
const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'supabase_schema.sql'), 'utf8');

assert.ok(categoriesSource, 'INITIAL_CATEGORIES must remain defined');
const categories = vm.runInNewContext(`(${categoriesSource[1]})`);

test('marketplace categories are unique and backed by the database enum', () => {
    const ids = categories.filter(category => category.id !== 'all').map(category => category.id);
    assert.equal(new Set(ids).size, ids.length);
    ['contracting', 'services', 'furniture', 'electronics'].forEach(id => {
        assert.ok(ids.includes(id), `Missing category ${id}`);
    });
    ids.forEach(id => {
        assert.match(`${schemaSource}\n${migrationSource}`, new RegExp(`'${id}'`), `Database enum is missing ${id}`);
    });
});
