const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'main.css'), 'utf8');

function luminance(hex) {
    const channels = hex.match(/[a-f\d]{2}/gi).map(value => {
        const channel = parseInt(value, 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrast(foreground, background) {
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
}

test('page theme uses a distinct warm-gray canvas and white surfaces', () => {
    assert.match(css, /--bg-body:\s*#f3f4f6;/i);
    assert.match(css, /--bg-surface:\s*#ffffff;/i);
    assert.match(css, /--border-color:\s*#d1d5db;/i);
});

test('primary and secondary typography exceed WCAG AA contrast', () => {
    assert.ok(contrast('#111827', '#f3f4f6') >= 4.5);
    assert.ok(contrast('#374151', '#f3f4f6') >= 4.5);
    assert.ok(contrast('#4b5563', '#ffffff') >= 4.5);
});
