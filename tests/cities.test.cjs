const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const dataSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
const citiesSource = dataSource.match(/const INITIAL_CITIES = (\[[\s\S]*?\n\]);/);

assert.ok(citiesSource, 'INITIAL_CITIES must remain defined in js/data.js');

const cities = vm.runInNewContext(citiesSource[1]);

test('city options are unique and cover every Saudi administrative region', () => {
    assert.equal(new Set(cities).size, cities.length);
    assert.ok(cities.length >= 150);

    const regionalExamples = [
        'الرياض',
        'مكة المكرمة',
        'المدينة المنورة',
        'الدمام',
        'بريدة (القصيم)',
        'أبها',
        'تبوك',
        'حائل',
        'جازان',
        'نجران',
        'الباحة',
        'عرعر',
        'سكاكا (الجوف)'
    ];

    regionalExamples.forEach(city => assert.ok(cities.includes(city), `Missing ${city}`));
});
