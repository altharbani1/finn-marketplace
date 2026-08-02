const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = {
    URL,
    window: { location: { origin: 'https://market.example' } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../js/security.js'), 'utf8'), context);

test('escapeHTML encodes executable markup and attributes', () => {
    assert.equal(
        context.escapeHTML('<img src=x onerror="alert(1)">'),
        '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
});

test('safeHttpUrl rejects script and data URLs', () => {
    assert.equal(context.safeHttpUrl('javascript:alert(1)', '/fallback'), '/fallback');
    assert.equal(context.safeHttpUrl('data:text/html,boom', '/fallback'), '/fallback');
    assert.equal(context.safeHttpUrl('https://cdn.example/image.jpg'), 'https://cdn.example/image.jpg');
});

test('safeTel strips characters that cannot be dialed', () => {
    assert.equal(context.safeTel('+966 50 123 4567;alert(1)'), '+966 50 123 4567(1)');
});

test('safeWhatsAppNumber normalizes Saudi mobile numbers', () => {
    assert.equal(context.safeWhatsAppNumber('050 123 4567'), '966501234567');
    assert.equal(context.safeWhatsAppNumber('+966 50 123 4567'), '966501234567');
    assert.equal(context.safeWhatsAppNumber('00966 50 123 4567'), '966501234567');
});

test('validatePassword requires length plus letters and numbers', () => {
    assert.match(context.validatePassword('short1'), /8/);
    assert.match(context.validatePassword('abcdefgh'), /حرفًا واحدًا ورقمًا/);
    assert.equal(context.validatePassword('secure123'), '');
});

test('listing image limit stays at 15', () => {
    assert.equal(vm.runInContext('MAX_LISTING_IMAGES', context), 15);
});
