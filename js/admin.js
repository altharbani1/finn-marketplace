/* global finnDB, escapeHTML, safeHttpUrl, DEFAULT_AVATAR, INITIAL_CITIES */
'use strict';

const adminState = {
    activeTab: 'overview',
    summary: null,
    loaded: new Set(),
    listings: { items: [], total: 0, page: 0, pageSize: 25, search: '' },
    users: { items: [], total: 0, page: 0, pageSize: 25, search: '' },
    reports: { items: [], total: 0, page: 0, pageSize: 25, status: '', targetType: '', category: '', priority: '', search: '' },
    deletions: { items: [], total: 0, page: 0, pageSize: 25 }
};

const adminTabs = ['overview', 'listings', 'users', 'reports', 'deletions', 'cities'];
let searchTimer = null;

function adminStatus(message = '', type = '') {
    const node = document.getElementById('adminGlobalStatus');
    node.textContent = message;
    node.className = `admin-state${type ? ` ${type}` : ''}`;
    node.hidden = !message;
}

function formatDate(value) {
    return value ? new Date(value).toLocaleDateString('ar-SA') : '—';
}

function statusLabel(status) {
    return ({ active: 'نشط', pending: 'قيد المراجعة', rejected: 'محظور / مرفوض', reserved: 'محجوز', sold: 'مباع' })[status] || status;
}

function pagerHTML(key) {
    const state = adminState[key];
    const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.total <= state.pageSize) return '';
    return `<button type="button" class="btn btn-outline" data-page-key="${key}" data-page="${state.page - 1}" ${state.page <= 0 ? 'disabled' : ''}>السابق</button>
        <span>صفحة ${state.page + 1} من ${pages} — ${state.total.toLocaleString('ar-SA')} سجل</span>
        <button type="button" class="btn btn-outline" data-page-key="${key}" data-page="${state.page + 1}" ${state.page + 1 >= pages ? 'disabled' : ''}>التالي</button>`;
}

function listingTable(items, compact = false) {
    if (!items.length) return '<p class="admin-state">لا توجد إعلانات مطابقة.</p>';
    return `<div class="admin-table-scroll"><table class="data-table">
        <caption class="sr-only">الإعلانات وإجراءات الإشراف</caption>
        <thead><tr><th>عنوان الإعلان</th><th>القسم</th><th>المدينة</th><th>السعر</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
        <tbody>${items.map(item => `<tr>
            <td><strong>${escapeHTML(item.title)}</strong></td>
            <td>${escapeHTML(item.subCategory || item.category || '—')}</td>
            <td>${escapeHTML(item.city)}</td>
            <td>${item.isFree ? 'مجاني' : `${item.price.toLocaleString('ar-SA')} ر.س`}</td>
            <td><span class="status-pill ${escapeHTML(item.status)}">${escapeHTML(statusLabel(item.status))}</span></td>
            <td><div class="admin-action-group">
                <a class="btn btn-outline" href="listing.html?id=${encodeURIComponent(item.id)}">معاينة</a>
                ${compact ? '' : `<button type="button" class="btn btn-outline" data-action="listing-status" data-id="${item.id}" data-status="${item.status === 'rejected' ? 'active' : 'rejected'}">${item.status === 'rejected' ? 'تفعيل' : 'حظر'}</button>
                <button type="button" class="btn btn-outline" data-action="listing-delete" data-id="${item.id}">حذف</button>`}
            </div></td>
        </tr>`).join('')}</tbody></table></div>`;
}

function renderSummary() {
    const summary = adminState.summary || {};
    document.getElementById('kpiTotalAds').textContent = Number(summary.listings || 0).toLocaleString('ar-SA');
    document.getElementById('badgeAdsCount').textContent = Number(summary.listings || 0).toLocaleString('ar-SA');
    document.getElementById('kpiUsersCount').textContent = Number(summary.users || 0).toLocaleString('ar-SA');
    document.getElementById('kpiVerifiedCount').textContent = Number(summary.verified || 0).toLocaleString('ar-SA');
    document.getElementById('kpiPendingReports').textContent = Number(summary.pendingReports || 0).toLocaleString('ar-SA');
    document.getElementById('badgeReportsCount').textContent = Number(summary.pendingReports || 0).toLocaleString('ar-SA');
    document.getElementById('badgeDeletionCount').textContent = Number(summary.openDeletions || 0).toLocaleString('ar-SA');
}

async function loadSummary() {
    adminState.summary = await finnDB.getAdminDashboardSummary();
    renderSummary();
}

async function loadOverview(force = false) {
    if (adminState.loaded.has('overview') && !force) return;
    adminStatus('جارٍ تحديث مؤشرات الإدارة…');
    const [summaryResult, listingResult] = await Promise.allSettled([
        finnDB.getAdminDashboardSummary(),
        finnDB.getAdminListingsPage({ page: 0, pageSize: 8 })
    ]);
    if (summaryResult.status === 'fulfilled') {
        adminState.summary = summaryResult.value;
        renderSummary();
    }
    if (listingResult.status === 'fulfilled') {
        document.getElementById('overviewTableWrapper').innerHTML = listingTable(listingResult.value.items, true);
    } else {
        document.getElementById('overviewTableWrapper').innerHTML = '<p class="admin-state error">تعذر جلب أحدث الإعلانات.</p>';
    }
    if (summaryResult.status === 'rejected' && listingResult.status === 'rejected') throw summaryResult.reason;
    adminState.loaded.add('overview');
    adminStatus('');
}

async function loadListings() {
    adminStatus('جارٍ جلب صفحة الإعلانات…');
    Object.assign(adminState.listings, await finnDB.getAdminListingsPage(adminState.listings));
    document.getElementById('fullListingsTableWrapper').innerHTML = listingTable(adminState.listings.items);
    document.getElementById('listingsPagination').innerHTML = pagerHTML('listings');
    adminState.loaded.add('listings');
    adminStatus('');
}

async function loadUsers() {
    adminStatus('جارٍ جلب صفحة الأعضاء…');
    Object.assign(adminState.users, await finnDB.getAdminProfilesPage(adminState.users));
    const body = document.getElementById('usersTableBody');
    body.innerHTML = adminState.users.items.length ? adminState.users.items.map(user => `<tr>
        <td><strong>${escapeHTML(user.name)}</strong></td><td>${escapeHTML(user.phone)}</td>
        <td><select class="admin-role-select" data-role-for="${user.id}" aria-label="دور ${escapeHTML(user.name)}">
            ${['user', 'seller', 'company', 'admin'].map(role => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${({ user: 'مستخدم', seller: 'بائع', company: 'شركة', admin: 'مدير' })[role]}</option>`).join('')}
        </select></td>
        <td><label><input type="checkbox" data-verified-for="${user.id}" ${user.verified ? 'checked' : ''}> حساب موثق</label></td>
        <td><button type="button" class="btn btn-outline" data-action="user-save" data-id="${user.id}">حفظ</button></td>
    </tr>`).join('') : '<tr><td colspan="5">لا يوجد أعضاء مطابقون.</td></tr>';
    document.getElementById('usersPagination').innerHTML = pagerHTML('users');
    adminState.loaded.add('users');
    adminStatus('');
}

function reportActions(report) {
    if (report.status === 'pending') return `<button type="button" class="btn btn-outline" data-action="report-status" data-id="${report.id}" data-current="pending" data-status="in_review">بدء المراجعة</button><button type="button" class="btn btn-outline" data-action="report-status" data-id="${report.id}" data-current="pending" data-status="dismissed">رفض</button>`;
    if (report.status === 'in_review') return `<button type="button" class="btn btn-outline" data-action="report-status" data-id="${report.id}" data-current="in_review" data-status="resolved" data-target-type="${report.targetType}">تم الحل</button><button type="button" class="btn btn-outline" data-action="report-status" data-id="${report.id}" data-current="in_review" data-status="dismissed">رفض</button>`;
    return '';
}

async function loadReports() {
    adminStatus('جارٍ جلب صفحة البلاغات…');
    Object.assign(adminState.reports, await finnDB.getAdminReportsPage(adminState.reports));
    const categories = { fraud: 'احتيال', prohibited: 'محظور', misleading: 'مضلل', duplicate: 'مكرر', abuse: 'إساءة', spam: 'مزعج', privacy: 'خصوصية', other: 'آخر' };
    const priorities = { 1: 'عادية', 2: 'متوسطة', 3: 'عاجلة' };
    document.getElementById('reportsContainer').innerHTML = adminState.reports.items.length ? `<div class="admin-table-scroll"><table class="data-table"><caption class="sr-only">بلاغات المحتوى وإجراءات معالجتها</caption><thead><tr><th>المحتوى</th><th>التصنيف</th><th>الأولوية</th><th>التفاصيل والأدلة</th><th>التاريخ</th><th>الحالة والإجراء</th></tr></thead><tbody>${adminState.reports.items.map(report => `<tr>
        <td>${report.listingId ? `<a href="listing.html?id=${encodeURIComponent(report.listingId)}">${escapeHTML(report.targetTitle)}</a>` : `تقييم — ${escapeHTML(report.targetTitle)}`}<small>المبلّغ: ${escapeHTML(report.reporterName)}</small></td>
        <td>${escapeHTML(categories[report.category] || report.category)}</td><td><span class="status-pill ${report.priority === 3 ? 'rejected' : report.priority === 2 ? 'pending' : 'active'}">${escapeHTML(priorities[report.priority])}</span></td><td>${escapeHTML(report.details)}${report.evidenceUrls.length ? `<details><summary>الأدلة (${report.evidenceUrls.length})</summary>${report.evidenceUrls.map(url => `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">فتح الدليل</a>`).join(' ')}</details>` : ''}</td><td>${formatDate(report.createdAt)}</td>
        <td><span class="status-pill ${escapeHTML(report.status)}">${escapeHTML(({ pending: 'جديد', in_review: 'تحت المراجعة', resolved: 'تم الحل', dismissed: 'مرفوض' })[report.status] || report.status)}</span><div class="admin-action-group">${reportActions(report)}</div>${report.resolutionNote ? `<small>ملاحظة: ${escapeHTML(report.resolutionNote)}</small>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="admin-state">لا توجد بلاغات مطابقة.</p>';
    document.getElementById('reportsPagination').innerHTML = pagerHTML('reports');
    adminState.loaded.add('reports');
    adminStatus('');
}

async function loadDeletions() {
    adminStatus('جارٍ جلب طلبات حذف الحساب…');
    Object.assign(adminState.deletions, await finnDB.getAdminDeletionRequestsPage(adminState.deletions));
    const labels = { pending: 'قيد المراجعة', processing: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي', failed: 'فشل — قابل لإعادة المحاولة' };
    document.getElementById('deletionRequestsContainer').innerHTML = adminState.deletions.items.length ? `<div class="admin-table-scroll"><table class="data-table"><caption class="sr-only">طلبات حذف الحساب</caption><thead><tr><th>الحساب</th><th>السبب</th><th>التاريخ</th><th>الحالة والإجراء</th></tr></thead><tbody>${adminState.deletions.items.map(request => `<tr>
        <td>${escapeHTML(request.email)}</td><td>${escapeHTML(request.reason || 'لم يذكر سببًا')}</td><td>${formatDate(request.requestedAt)}</td>
        <td><span class="status-pill ${escapeHTML(request.status)}">${escapeHTML(labels[request.status] || request.status)}</span>${request.failureReason ? `<small>${escapeHTML(request.failureReason)}</small>` : ''}${['pending', 'failed'].includes(request.status) ? `<button type="button" class="btn btn-outline" data-action="deletion-process" data-id="${request.id}">تنفيذ الحذف النهائي</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="admin-state">لا توجد طلبات حذف حساب.</p>';
    document.getElementById('deletionsPagination').innerHTML = pagerHTML('deletions');
    adminState.loaded.add('deletions');
    adminStatus('');
}

function loadCities() {
    document.getElementById('citiesCountBadge').textContent = INITIAL_CITIES.length.toLocaleString('ar-SA');
    document.getElementById('citiesListAdmin').innerHTML = INITIAL_CITIES.map(city => `<span class="status-pill active">${escapeHTML(city)}</span>`).join('');
    adminState.loaded.add('cities');
}

async function loadTab(tab, force = false) {
    try {
        if (!force && adminState.loaded.has(tab)) return;
        if (tab === 'overview') await loadOverview(force);
        if (tab === 'listings') await loadListings();
        if (tab === 'users') await loadUsers();
        if (tab === 'reports') await loadReports();
        if (tab === 'deletions') await loadDeletions();
        if (tab === 'cities') loadCities();
    } catch (error) {
        adminStatus(`${error.message || 'تعذر تحميل البيانات.'} استخدم زر تحديث البيانات للمحاولة مجددًا.`, 'error');
    }
}

function switchTab(tab) {
    adminState.activeTab = tab;
    document.querySelectorAll('[data-admin-tab]').forEach(button => {
        const selected = button.dataset.adminTab === tab;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
    adminTabs.forEach(name => { document.getElementById(`tab${name[0].toUpperCase()}${name.slice(1)}`).hidden = name !== tab; });
    loadTab(tab);
}

async function runButton(button, operation) {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try { await operation(); } finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

async function handleAction(button) {
    const { action, id } = button.dataset;
    if (action === 'listing-status') await runButton(button, async () => {
        await finnDB.updateListingStatus(id, button.dataset.status);
        await Promise.all([loadListings(), loadSummary()]);
    });
    if (action === 'listing-delete') {
        if (!confirm('هل أنت متأكد من حذف هذا الإعلان نهائيًا؟')) return;
        await runButton(button, async () => {
            const result = await finnDB.deleteListing(id);
            adminState.listings.page = Math.max(0, adminState.listings.page - (adminState.listings.items.length === 1 ? 1 : 0));
            await Promise.all([loadListings(), loadSummary()]);
            if (result.cleanupWarning) alert(result.cleanupWarning);
        });
    }
    if (action === 'user-save') await runButton(button, async () => {
        const role = document.querySelector(`[data-role-for="${id}"]`).value;
        const verified = document.querySelector(`[data-verified-for="${id}"]`).checked;
        await finnDB.updateAdminProfile(id, role, verified);
        await Promise.all([loadUsers(), loadSummary()]);
        adminStatus('تم حفظ صلاحيات العضو وتسجيل العملية في سجل التدقيق.');
    });
    if (action === 'report-status') await runButton(button, async () => {
        const finalDecision = ['resolved', 'dismissed'].includes(button.dataset.status);
        const note = prompt(`أدخل ملاحظة ${finalDecision ? 'القرار (مطلوبة)' : 'المراجعة (اختيارية)'}، حتى 1000 حرف:`, '') ?? '';
        if (finalDecision && note.trim().length < 3) throw new Error('ملاحظة القرار مطلوبة ويجب ألا تقل عن 3 أحرف.');
        const hideContent = button.dataset.status === 'resolved' && button.dataset.targetType === 'rating'
            ? confirm('هل ثبتت مخالفة التقييم وتريد إخفاءه من سجل المعلن؟') : false;
        await finnDB.updateAdminReport(id, button.dataset.current, button.dataset.status, note, hideContent);
        await Promise.all([loadReports(), loadSummary()]);
    });
    if (action === 'deletion-process') {
        if (!confirm('هذا الإجراء نهائي ويحذف حساب Auth وبياناته. هل راجعت الطلب؟')) return;
        if (prompt('للتأكيد اكتب كلمة: حذف') !== 'حذف') return;
        await runButton(button, async () => {
            await finnDB.processAccountDeletionRequest(id);
            await Promise.all([loadDeletions(), loadSummary()]);
            adminStatus('اكتمل حذف الحساب وبياناته المرتبطة.');
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const authUser = await finnDB.getAuthUser();
        if (!authUser || authUser.role !== 'admin') {
            alert('غير مصرح لك بالدخول إلى لوحة الإدارة.');
            window.location.replace('index.html');
            return;
        }
        document.getElementById('adminNameTxt').textContent = authUser.name;
        document.getElementById('adminAvatarImg').src = safeHttpUrl(authUser.avatar, DEFAULT_AVATAR);
        document.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.adminTab)));
        document.querySelector('[role="tablist"]').addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            const current = adminTabs.indexOf(adminState.activeTab);
            const offset = event.key === 'ArrowLeft' ? 1 : -1;
            const next = adminTabs[(current + offset + adminTabs.length) % adminTabs.length];
            switchTab(next);
            document.querySelector(`[data-admin-tab="${next}"]`).focus();
        });
        document.getElementById('refreshAdminData').addEventListener('click', () => {
            adminState.loaded.delete(adminState.activeTab);
            loadTab(adminState.activeTab, true);
        });
        document.getElementById('searchAdminAdsInput').addEventListener('input', event => {
            clearTimeout(searchTimer); searchTimer = setTimeout(() => { adminState.listings.search = event.target.value; adminState.listings.page = 0; loadListings(); }, 350);
        });
        document.getElementById('searchAdminUsersInput').addEventListener('input', event => {
            clearTimeout(searchTimer); searchTimer = setTimeout(() => { adminState.users.search = event.target.value; adminState.users.page = 0; loadUsers(); }, 350);
        });
        document.getElementById('reportsStatusFilter').addEventListener('change', event => {
            adminState.reports.status = event.target.value; adminState.reports.page = 0; loadReports();
        });
        [['Target', 'targetType'], ['Category', 'category'], ['Priority', 'priority']].forEach(([name, key]) => document.getElementById(`reports${name}Filter`).addEventListener('change', event => {
            adminState.reports[key] = event.target.value; adminState.reports.page = 0; loadReports();
        }));
        document.getElementById('searchAdminReportsInput').addEventListener('input', event => {
            clearTimeout(searchTimer); searchTimer = setTimeout(() => { adminState.reports.search = event.target.value; adminState.reports.page = 0; loadReports(); }, 350);
        });
        document.getElementById('adminContentContainer').addEventListener('click', async event => {
            const pageButton = event.target.closest('[data-page-key]');
            if (pageButton) {
                const key = pageButton.dataset.pageKey; adminState[key].page = Number(pageButton.dataset.page); await loadTab(key, true); return;
            }
            const actionButton = event.target.closest('[data-action]');
            if (!actionButton) return;
            try { await handleAction(actionButton); } catch (error) { adminStatus(error.message || 'تعذر تنفيذ الإجراء.', 'error'); }
        });
        await loadOverview();
    } catch (error) {
        adminStatus(`${error.message || 'تعذر بدء لوحة الإدارة.'} تحقق من الاتصال ثم أعد المحاولة.`, 'error');
    }
});
