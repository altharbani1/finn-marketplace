const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const indexSource = read('index.html');
const listingSource = read('listing.html');
const profileSource = read('profile.html');
const adminSource = read('admin.html');
const appSource = read('js/app.js');
const mainStyles = read('css/main.css');

test('closed dialogs are hidden and expose accessible dialog semantics', () => {
    for (const id of ['realAuthModal', 'detailModal', 'postAdModal', 'chatModal']) {
        const dialog = new RegExp(`id="${id}"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="[^"]+"[^>]*aria-hidden="true"[^>]*hidden[^>]*inert`);
        assert.match(indexSource, dialog);
    }
    assert.match(listingSource, /id="reportModal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="reportDialogTitle"[^>]*hidden[^>]*inert/);
    assert.match(mainStyles, /\.modal-overlay\[hidden\]\s*\{\s*display:\s*none/);
    assert.match(appSource, /showModal\(modalId/);
    assert.match(appSource, /event\.key === 'Escape'/);
    assert.match(appSource, /event\.key !== 'Tab'/);
    assert.match(appSource, /modalFocusOrigins/);
});
test('forms have explicit labels and listing cards use semantic links', () => {
    for (const id of ['loginEmail', 'loginPassword', 'regName', 'regEmail', 'regPhone', 'regPassword', 'regPasswordConfirm', 'resetEmail', 'newPassword', 'newPasswordConfirm', 'adTitle', 'adCategory', 'adCity', 'adNeighborhood', 'adPrice', 'adCondition', 'adFileInput', 'adDescription']) {
        assert.match(indexSource, new RegExp(`<label[^>]*for="${id}"`));
        assert.match(indexSource, new RegExp(`id="${id}"`));
    }
    assert.match(appSource, /<article class="listing-card"/);
    assert.match(appSource, /class="listing-card-main-link" href="listing\.html\?id=/);
    assert.match(appSource, /aria-label="\$\{isFav \? 'إزالة الإعلان من المفضلة' : 'إضافة الإعلان إلى المفضلة'\}"/);
    assert.match(profileSource, /role="tablist"/);
    assert.match(profileSource, /role="tabpanel"/);
    assert.match(listingSource, /<button type="button" class="gallery-thumb-item/);
});

test('mobile layout is compact and ad fields collapse to one column', () => {
    assert.match(mainStyles, /@media \(max-width: 600px\)[\s\S]*?\.hero-tags\s*\{\s*display:\s*none/);
    assert.match(mainStyles, /\.ad-form-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr 1fr/);
    assert.match(mainStyles, /@media \(max-width: 600px\)[\s\S]*?\.ad-form-grid\s*\{\s*grid-template-columns:\s*1fr/);
    assert.match(listingSource, /@media \(max-width: 600px\)[\s\S]*?\.gallery-main-box\s*\{[\s\S]*?aspect-ratio:\s*4 \/ 3/);
});

test('login returns to listing and listing data avoids fabricated neighborhood', () => {
    assert.match(listingSource, /index\.html\?login=1&next=/);
    assert.match(listingSource, /getListingSeller\(currentItem\.id\)/);
    assert.doesNotMatch(appSource, /neighborhood:\s*'وسط المدينة'/);
    assert.match(appSource, /neighborhood:\s*form\.adNeighborhood\.value\.trim\(\)/);
    assert.match(indexSource, /id="adPrice"[^>]*min="0"[^>]*required/);
    assert.match(appSource, /form\.adPrice\.required = !isFree/);
});

test('profile and loading states give users a recovery path', () => {
    assert.match(profileSource, /<input(?=[^>]*id="editEmail")(?=[^>]*type="email")[^>]*>/);
    assert.match(profileSource, /requestEmailChange/);
    assert.match(profileSource, /لا توجد إعلانات منشورة/);
    assert.match(profileSource, /المفضلة فارغة/);
    assert.match(profileSource, /تعذر تحميل الملف الشخصي/);
    assert.match(appSource, /إعادة المحاولة/);
    assert.match(adminSource, /<button type="button" class="admin-nav-item/);
});
