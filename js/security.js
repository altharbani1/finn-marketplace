// Shared output-encoding helpers for values rendered into HTML templates.
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

function validatePassword(password) {
    const value = String(password ?? '');
    if (value.length < 8) return 'كلمة المرور يجب ألا تقل عن 8 أحرف.';
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'استخدم حرفًا واحدًا ورقمًا واحدًا على الأقل.';
    return '';
}

