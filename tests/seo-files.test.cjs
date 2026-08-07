const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('robots exposes the public site while protecting private interfaces', () => {
    const robots = read('robots.txt');

    assert.match(robots, /^User-agent: \*$/m);
    assert.match(robots, /^Allow: \/$/m);
    assert.match(robots, /^Disallow: \/admin\.html$/m);
    assert.match(robots, /^Disallow: \/profile\.html$/m);
    assert.match(robots, /^Sitemap: https:\/\/fann1\.netlify\.app\/sitemap\.xml$/m);
});

test('sitemap contains only canonical public pages', () => {
    const sitemap = read('sitemap.xml');
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);

    assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(sitemap, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
    assert.deepEqual(locations, [
        'https://fann1.netlify.app/',
        'https://fann1.netlify.app/about.html',
        'https://fann1.netlify.app/safety.html',
        'https://fann1.netlify.app/privacy.html',
        'https://fann1.netlify.app/terms.html',
        'https://fann1.netlify.app/contact.html'
    ]);
    assert.doesNotMatch(sitemap, /admin\.html|profile\.html|listing\.html/);
});

test('custom not-found document is localized, accessible, and non-indexable', () => {
    const notFound = read('404.html');

    assert.match(notFound, /<html lang="ar-SA" dir="rtl">/);
    assert.match(notFound, /<meta name="robots" content="noindex, follow">/);
    assert.match(notFound, /<h1>الصفحة غير موجودة<\/h1>/);
    assert.match(notFound, /<a href="\/">العودة إلى السوق<\/a>/);
    assert.match(notFound, /<nav aria-label="خيارات الرجوع">/);
});
