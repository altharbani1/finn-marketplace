// Shared output-encoding helpers for values rendered into HTML templates.
const MAX_LISTING_IMAGES = 15;

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    })[char]);
}

function safeHttpUrl(value, fallback = '') {
    try {
        const parsed = new URL(String(value), window.location.origin);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
    } catch (_) {}
    return fallback;
}

function safeTel(value) {
    return String(value ?? '').replace(/[^+0-9()\s-]/g, '');
}

function safeWhatsAppNumber(value) {
    let digits = String(value ?? '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = `966${digits.slice(1)}`;
    if (digits.length === 9 && digits.startsWith('5')) digits = `966${digits}`;
    return digits;
}

function validatePassword(password) {
    const value = String(password ?? '');
    if (value.length < 8) return 'كلمة المرور يجب ألا تقل عن 8 أحرف.';
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'استخدم حرفًا واحدًا ورقمًا واحدًا على الأقل.';
    return '';
}

