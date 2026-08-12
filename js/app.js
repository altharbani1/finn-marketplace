// Senior Production Engineer Controller for FinnMarket
// Connected Live to Supabase Auth & Real PostgreSQL Database

class FinnMarketApp {
    constructor() {
        this.listings = [];
        this.favorites = finnDB.getFavorites();
        this.chatPollTimer = null;
        this.modalFocusOrigins = new Map();
        this.favoriteUpdates = new Set();
        this.searchRequestId = 0;
        
        // Active Filters State
        this.state = {
            category: 'all',
            searchQuery: '',
            searchResults: null,
            searchPage: 0,
            hasMoreSearchResults: false,
            isSearching: false,
            showFavoritesOnly: false,
            currentDetailListing: null,
            activeImageIdx: 0,
            uploadedImages: [],
            editingListingId: null,
            activeAuthTab: 'login',
            activeThreadId: null,
            pendingChatListingId: null,
            pendingReturnUrl: null,
            listingsPage: 0,
            listingsPageSize: 30,
            hasMoreListings: true,
            isLoading: true
        };

        this.init();
    }

    async init() {
        this.setupAuthLifecycle();
        this.renderLoadingState();
        try {
            this.listings = await finnDB.getListings(0, this.state.listingsPageSize);
            this.state.hasMoreListings = this.listings.length === this.state.listingsPageSize;
            this.favorites = await finnDB.syncFavorites();
            this.state.isLoading = false;
        } catch (err) {
            console.error('Listings Load Error:', err);
            this.renderErrorState('تعذر جلب الإعلانات من السيرفر. يرجى إعادة تنشيط الصفحة.');
            return;
        }

        this.renderCategoryBar();
        this.renderCityOptions();
        await this.renderAuthNavHeader();
        this.applyFiltersAndRender();
        this.setupEventListeners();

        const queryParams = new URLSearchParams(window.location.search);
        const requestedReturnUrl = queryParams.get('next');
        if (requestedReturnUrl && /^listing\.html\?id=[0-9a-f-]+$/i.test(requestedReturnUrl)) {
            this.state.pendingReturnUrl = requestedReturnUrl;
        }
        if (queryParams.get('login') === '1') {
            this.openAuthModal();
            history.replaceState(null, '', window.location.pathname);
        }
        const chatListingId = queryParams.get('chat');
        if (chatListingId) {
            this.state.pendingChatListingId = chatListingId;
            await this.openChatsModal(chatListingId);
        }
        const editListingId = queryParams.get('edit');
        if (editListingId) {
            await this.openEditAdModal(editListingId);
            history.replaceState(null, '', window.location.pathname);
        }
    }

    renderLoadingState() {
        const feedContainer = document.getElementById('listingsFeed');
        if (!feedContainer) return;
        feedContainer.className = 'listings-grid';
        feedContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 80px 20px;">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 40px; color: var(--color-primary); margin-bottom: 16px;"></i>
                <h3 style="font-size: 18px; font-weight: 800;">جاري تحميل الإعلانات الموثقة...</h3>
            </div>
        `;
    }

    renderErrorState(msg) {
        const feedContainer = document.getElementById('listingsFeed');
        if (!feedContainer) return;
        feedContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: #fff5f5; border-radius: 18px; border: 1px dashed #ef4444;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                <h3 style="font-size: 20px; font-weight: 800; color: #991b1b;">خطأ في الاتصال بالشبكة</h3>
                <p style="color: #7f1d1d; margin: 6px 0 16px;">${escapeHTML(msg)}</p>
                <button type="button" class="btn btn-primary" onclick="window.location.reload()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> إعادة المحاولة</button>
            </div>
        `;
    }

    async renderAuthNavHeader() {
        const navActions = document.querySelector('.nav-actions');
        if (!navActions) return;

        const authUser = await finnDB.getAuthUser();

        if (authUser) {
            navActions.innerHTML = `
                <button class="btn btn-outline btn-icon" id="btnHeaderFavs" onclick="app.toggleFavoritesFilter()" title="الإعلانات المفضلة">
                    <i class="fa-solid fa-heart" style="color: #ef4444;"></i>
                    <span class="badge-count" id="favBadge" style="display: none;">0</span>
                </button>

                <button class="btn btn-outline btn-icon" onclick="app.openChatsModal()" title="المحادثات الخاصة" aria-label="المحادثات الخاصة">
                    <i class="fa-regular fa-comments"></i>
                </button>

                ${authUser.role === 'admin' ? `<a href="admin.html" class="btn btn-outline" style="color: #ef4444; border-color: #fca5a5;" title="لوحة التحكّم الإدارية">
                    <i class="fa-solid fa-shield-halved"></i> الإدارة
                </a>` : ''}

                <div class="account-menu" id="accountMenu">
                    <button type="button" class="user-profile-btn" id="accountMenuButton" onclick="app.toggleAccountMenu(event)" aria-haspopup="menu" aria-expanded="false" title="قائمة الحساب">
                        <img src="${escapeHTML(safeHttpUrl(authUser.avatar, DEFAULT_AVATAR))}" class="user-avatar-head" alt="">
                        <span class="account-menu-user-name">${escapeHTML(authUser.name)}</span>
                        <i class="fa-solid fa-chevron-down account-menu-chevron" aria-hidden="true"></i>
                    </button>
                    <div class="account-dropdown" id="accountDropdown" role="menu" hidden>
                        <a href="profile.html?tab=myAds" class="account-dropdown-item" role="menuitem"><i class="fa-solid fa-layer-group" aria-hidden="true"></i><span>إعلاناتي</span></a>
                        <a href="profile.html?tab=favs" class="account-dropdown-item" role="menuitem"><i class="fa-solid fa-heart" aria-hidden="true"></i><span>المفضلة</span></a>
                        <a href="profile.html?tab=settings" class="account-dropdown-item" role="menuitem"><i class="fa-solid fa-user-gear" aria-hidden="true"></i><span>الحساب</span></a>
                        <button type="button" class="account-dropdown-item account-dropdown-logout" role="menuitem" onclick="app.handleLogout()"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i><span>تسجيل خروج</span></button>
                    </div>
                </div>

                <button class="btn btn-primary" onclick="app.openPostAdModal()">
                    <i class="fa-solid fa-circle-plus"></i>
                    <span>أضف إعلانك</span>
                </button>
            `;
        } else {
            navActions.innerHTML = `
                <button class="btn btn-outline btn-icon" id="btnHeaderFavs" onclick="app.toggleFavoritesFilter()" title="الإعلانات المفضلة">
                    <i class="fa-regular fa-heart"></i>
                    <span class="badge-count" id="favBadge" style="display: none;">0</span>
                </button>
                
                <button class="btn btn-outline" onclick="app.openAuthModal('login')">
                    <i class="fa-solid fa-right-to-bracket"></i> دخول / تسجيل حساب
                </button>

                <button class="btn btn-primary" onclick="app.openPostAdModal()">
                    <i class="fa-solid fa-circle-plus"></i>
                    <span>أضف إعلانك</span>
                </button>
            `;
        }
        this.updateHeaderBadges();
    }

    toggleAccountMenu(event) {
        event?.stopPropagation();
        const menu = document.getElementById('accountMenu');
        const dropdown = document.getElementById('accountDropdown');
        const button = document.getElementById('accountMenuButton');
        if (!menu || !dropdown || !button) return;
        const shouldOpen = dropdown.hidden;
        dropdown.hidden = !shouldOpen;
        menu.classList.toggle('open', shouldOpen);
        button.setAttribute('aria-expanded', String(shouldOpen));
    }

    closeAccountMenu() {
        const menu = document.getElementById('accountMenu');
        const dropdown = document.getElementById('accountDropdown');
        const button = document.getElementById('accountMenuButton');
        if (!dropdown || dropdown.hidden) return;
        dropdown.hidden = true;
        menu?.classList.remove('open');
        button?.setAttribute('aria-expanded', 'false');
    }

    toggleFavoritesFilter() {
        this.state.showFavoritesOnly = !this.state.showFavoritesOnly;
        const button = document.getElementById('btnHeaderFavs');
        button?.setAttribute('aria-pressed', String(this.state.showFavoritesOnly));
        button?.classList.toggle('active', this.state.showFavoritesOnly);
        if (button) button.title = this.state.showFavoritesOnly ? 'عرض جميع الإعلانات' : 'عرض المفضلة فقط';
        this.applyFiltersAndRender();
    }

    async handleLogout() {
        if (confirm('هل ترغب في تسجيل الخروج من حسابك الموثق؟')) {
            await finnDB.logoutUser();
            alert('تم تسجيل الخروج بنجاح.');
            await this.renderAuthNavHeader();
        }
    }

    switchAuthTab(tab) {
        this.state.activeAuthTab = tab;
        const loginForm = document.getElementById('loginAuthForm');
        const regForm = document.getElementById('registerAuthForm');
        const forgotForm = document.getElementById('forgotPasswordForm');
        const updatePasswordForm = document.getElementById('updatePasswordForm');
        const tabLoginBtn = document.getElementById('tabLoginBtn');
        const tabRegBtn = document.getElementById('tabRegisterBtn');

        [loginForm, regForm, forgotForm, updatePasswordForm].forEach(form => {
            if (form) form.style.display = 'none';
        });
        tabLoginBtn?.classList.toggle('active', tab === 'login');
        tabRegBtn?.classList.toggle('active', tab === 'register');
        tabLoginBtn?.setAttribute('aria-selected', String(tab === 'login'));
        tabRegBtn?.setAttribute('aria-selected', String(tab === 'register'));

        if (tab === 'login' && loginForm) loginForm.style.display = 'block';
        if (tab === 'register' && regForm) regForm.style.display = 'block';
        if (tab === 'forgot' && forgotForm) forgotForm.style.display = 'block';
        if (tab === 'recovery' && updatePasswordForm) updatePasswordForm.style.display = 'block';
    }

    setupAuthLifecycle() {
        try {
            finnDB.onAuthStateChange((event) => {
                if (event === 'PASSWORD_RECOVERY') {
                    window.setTimeout(() => this.openAuthModal('recovery'), 0);
                } else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
                    window.setTimeout(() => this.renderAuthNavHeader(), 0);
                }
            });
        } catch (_) {}

        const callbackParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const callbackError = callbackParams.get('error_description');
        if (callbackError) {
            window.setTimeout(() => {
                this.openAuthModal('login');
                this.setAuthNotice('رابط المصادقة غير صالح أو انتهت صلاحيته. حاول مرة أخرى.', 'error');
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }, 0);
        }
    }

    getAuthRedirectUrl() {
        return `${window.location.origin}${window.location.pathname}`;
    }

    setAuthNotice(message = '', type = 'info') {
        const noticeBox = document.getElementById('authNoticeBox');
        if (!noticeBox) return;
        noticeBox.innerHTML = message
            ? `<div class="auth-notice ${type}" role="status">${escapeHTML(message)}</div>`
            : '';
    }

    setFormLoading(form, isLoading, loadingText) {
        const button = form.querySelector('button[type="submit"]');
        if (!button) return;
        if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
        button.disabled = isLoading;
        button.innerHTML = isLoading
            ? `<i class="fa-solid fa-circle-notch fa-spin"></i> ${escapeHTML(loadingText)}`
            : button.dataset.originalHtml;
    }

    async handleRealLogin(event) {
        event.preventDefault();
        const form = event.target;
        const email = form.loginEmail.value.trim();
        const password = form.loginPassword.value;

        this.setAuthNotice();
        this.setFormLoading(form, true, 'جاري تسجيل الدخول...');
        try {
            const user = await finnDB.loginRealUser(email, password);
            this.favorites = await finnDB.syncFavorites();
            form.reset();
            this.closeModal('realAuthModal');
            await this.renderAuthNavHeader();
            if (this.state.pendingChatListingId) await this.openChatsModal(this.state.pendingChatListingId);
            if (this.state.pendingReturnUrl) {
                window.location.href = this.state.pendingReturnUrl;
                return;
            }
            alert(`مرحبًا ${user.name}، تم تسجيل دخولك بنجاح.`);
        } catch (err) {
            this.setAuthNotice(err.message, 'error');
        } finally {
            this.setFormLoading(form, false);
        }
    }

    async handleRealRegister(event) {
        event.preventDefault();
        const form = event.target;
        const name = form.regName.value.trim();
        const email = form.regEmail.value.trim();
        const password = form.regPassword.value;
        const passwordConfirm = form.regPasswordConfirm.value;
        const phone = form.regPhone.value.trim();

        const passwordError = validatePassword(password);
        if (passwordError) return this.setAuthNotice(passwordError, 'error');
        if (password !== passwordConfirm) return this.setAuthNotice('كلمتا المرور غير متطابقتين.', 'error');

        this.setAuthNotice();
        this.setFormLoading(form, true, 'جاري إنشاء الحساب...');
        try {
            const user = await finnDB.registerRealUser(name, email, password, phone, this.getAuthRedirectUrl());
            form.reset();
            if (user.requiresEmailConfirmation) {
                this.switchAuthTab('login');
                document.querySelector('[name="loginEmail"]').value = email;
                this.setAuthNotice('تم إنشاء الحساب. افتح رسالة التأكيد المرسلة إلى بريدك، ثم سجّل الدخول.', 'success');
            } else {
                this.closeModal('realAuthModal');
                await this.renderAuthNavHeader();
                if (this.state.pendingChatListingId) await this.openChatsModal(this.state.pendingChatListingId);
                if (this.state.pendingReturnUrl) {
                    window.location.href = this.state.pendingReturnUrl;
                    return;
                }
                alert(`مرحبًا ${name}، تم إنشاء حسابك وتسجيل دخولك بنجاح.`);
            }
        } catch (err) {
            this.setAuthNotice(err.message, 'error');
        } finally {
            this.setFormLoading(form, false);
        }
    }

    async handlePasswordResetRequest(event) {
        event.preventDefault();
        const form = event.target;
        const email = form.resetEmail.value.trim();
        this.setAuthNotice();
        this.setFormLoading(form, true, 'جاري إرسال الرابط...');
        try {
            await finnDB.requestPasswordReset(email, this.getAuthRedirectUrl());
            form.reset();
            this.setAuthNotice('إذا كان البريد مسجلًا، ستصلك رسالة الاستعادة خلال دقائق. افحص البريد غير المرغوب أيضًا.', 'success');
        } catch (err) {
            this.setAuthNotice(err.message, 'error');
        } finally {
            this.setFormLoading(form, false);
        }
    }

    async handleRecoveredPasswordUpdate(event) {
        event.preventDefault();
        const form = event.target;
        const password = form.newPassword.value;
        const passwordConfirm = form.newPasswordConfirm.value;
        const passwordError = validatePassword(password);
        if (passwordError) return this.setAuthNotice(passwordError, 'error');
        if (password !== passwordConfirm) return this.setAuthNotice('كلمتا المرور غير متطابقتين.', 'error');

        this.setAuthNotice();
        this.setFormLoading(form, true, 'جاري حفظ كلمة المرور...');
        try {
            await finnDB.updateRecoveredPassword(password);
            await finnDB.logoutUser();
            form.reset();
            this.switchAuthTab('login');
            this.setAuthNotice('تم تحديث كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.', 'success');
            history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch (err) {
            this.setAuthNotice(err.message, 'error');
        } finally {
            this.setFormLoading(form, false);
        }
    }

    updateHeaderBadges() {
        const favBadge = document.getElementById('favBadge');
        if (favBadge) {
            favBadge.textContent = this.favorites.length;
            favBadge.style.display = this.favorites.length > 0 ? 'flex' : 'none';
        }
    }

    renderCategoryBar() {
        const catNav = document.getElementById('catNavList');
        if (!catNav) return;

        catNav.innerHTML = INITIAL_CATEGORIES.map(cat => `
            <li class="cat-nav-item ${this.state.category === cat.id ? 'active' : ''}">
                <button type="button" data-cat="${cat.id}" aria-pressed="${this.state.category === cat.id}">
                    <i class="fa-solid ${cat.icon}"></i>
                    <span>${cat.name}</span>
                </button>
            </li>
        `).join('');
        document.querySelectorAll('.hero-tag-btn[data-cat]').forEach(button => {
            const active = button.dataset.cat === this.state.category;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    renderCityOptions() {
        const postAdCitySelect = document.querySelector('select[name="adCity"]');
        const categorySelect = document.querySelector('select[name="adCategory"]');

        const postAdOptionsHTML = INITIAL_CITIES.filter(c => c !== 'جميع المدن').map(c => `<option value="${c}">${c}</option>`).join('');

        if (postAdCitySelect) {
            postAdCitySelect.innerHTML = postAdOptionsHTML;
        }
        if (categorySelect) {
            categorySelect.innerHTML = INITIAL_CATEGORIES
                .filter(category => category.id !== 'all')
                .map(category => `<option value="${escapeHTML(category.id)}">${escapeHTML(category.name)}</option>`)
                .join('');
            categorySelect.value = 'marketplace';
        }
    }

    async handleImageFileUpload(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        const countLabel = document.getElementById('imageCountLabel');
        if (countLabel) countLabel.textContent = 'جاري تجهيز الصور للمعاينة...';

        const remainingSlots = MAX_LISTING_IMAGES - this.state.uploadedImages.length;
        if (remainingSlots <= 0) {
            alert(`وصلت إلى الحد الأقصى: ${MAX_LISTING_IMAGES} صورة لكل إعلان.`);
            event.target.value = '';
            return;
        }

        const acceptedFiles = files.filter(file => {
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                alert(`الملف (${file.name}) ليس بصيغة صورة مدعومة.`);
                return false;
            }
            if (file.size > 5 * 1024 * 1024) {
                alert(`الصورة (${file.name}) أكبر من 5 ميجابايت.`);
                return false;
            }
            return true;
        }).slice(0, remainingSlots);

        if (acceptedFiles.length < files.length && files.length > remainingSlots) {
            alert(`تم قبول ${acceptedFiles.length} صورة فقط لإكمال الحد الأقصى البالغ ${MAX_LISTING_IMAGES} صورة.`);
        }

        for (let index = 0; index < acceptedFiles.length; index += 1) {
            if (countLabel) countLabel.textContent = `جاري تحسين الصورة ${index + 1} من ${acceptedFiles.length}...`;
            try {
                this.state.uploadedImages.push(await this.optimizeListingImage(acceptedFiles[index]));
            } catch (_) {
                this.state.uploadedImages.push(acceptedFiles[index]);
            }
        }
        this.renderImagePreviews();
        event.target.value = '';
    }

    async optimizeListingImage(file) {
        const bitmap = await createImageBitmap(file);
        const maxDimension = 1600;
        const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        if (scale === 1 && file.type === 'image/webp' && file.size <= 1200 * 1024) {
            bitmap.close();
            return file;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise((resolve, reject) => canvas.toBlob(
            result => result ? resolve(result) : reject(new Error('تعذر ضغط الصورة.')),
            'image/webp',
            0.82
        ));
        const safeName = file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'listing-image';
        return new File([blob], `${safeName}.webp`, { type: 'image/webp', lastModified: Date.now() });
    }

    renderImagePreviews() {
        const container = document.getElementById('imagePreviewContainer');
        const countLabel = document.getElementById('imageCountLabel');
        if (!container) return;

        if (countLabel) countLabel.textContent = `${this.state.uploadedImages.length} من ${MAX_LISTING_IMAGES} صورة`;

        container.querySelectorAll('img[data-object-url]').forEach(img => URL.revokeObjectURL(img.src));
        container.innerHTML = this.state.uploadedImages.map((image, idx) => {
            const isFile = typeof File !== 'undefined' && image instanceof File;
            const previewUrl = isFile ? URL.createObjectURL(image) : image;
            return `
            <div class="preview-thumb-card">
                <img src="${escapeHTML(previewUrl)}" ${isFile ? 'data-object-url="true"' : ''} alt="صورة الإعلان ${idx + 1}">
                <button type="button" class="remove-thumb-btn" onclick="event.stopPropagation(); app.removeUploadedImage(${idx})" title="إزالة الصورة" aria-label="إزالة الصورة ${idx + 1}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `;
        }).join('');
    }

    removeUploadedImage(index) {
        this.state.uploadedImages.splice(index, 1);
        this.renderImagePreviews();
    }

    applyFiltersAndRender() {
        let filtered = [...(this.state.searchResults ?? this.listings)];

        if (this.state.showFavoritesOnly) {
            filtered = filtered.filter(item => this.favorites.includes(item.id));
        }

        if (this.state.category !== 'all') {
            filtered = filtered.filter(item => item.category === this.state.category);
        }

        this.renderListings(filtered);
    }

    renderSearchLoading(query) {
        const feedContainer = document.getElementById('listingsFeed');
        const countContainer = document.getElementById('resultsCount');
        if (countContainer) countContainer.textContent = `جاري البحث عن «${query}»...`;
        if (!feedContainer) return;
        feedContainer.className = 'listings-grid list-view';
        feedContainer.innerHTML = `
            <div class="search-status" role="status" aria-live="polite">
                <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
                <strong>جاري البحث في جميع الإعلانات...</strong>
            </div>
        `;
    }

    async submitSearch(rawQuery) {
        const query = String(rawQuery || '').trim().replace(/\s+/g, ' ').slice(0, 100);
        if (!query) {
            this.clearFilters();
            return;
        }
        if (query.length < 2) {
            alert('اكتب حرفين على الأقل للبحث.');
            document.getElementById('globalSearch')?.focus();
            return;
        }

        const requestId = ++this.searchRequestId;
        const searchInput = document.getElementById('globalSearch');
        const searchButton = document.getElementById('globalSearchButton');
        this.state.isSearching = true;
        this.state.searchQuery = query;
        this.state.category = 'all';
        this.state.showFavoritesOnly = false;
        this.renderCategoryBar();
        this.renderSearchLoading(query);
        if (searchInput) searchInput.disabled = true;
        if (searchButton) searchButton.disabled = true;

        try {
            const results = await finnDB.searchListings(query, 0, this.state.listingsPageSize);
            if (requestId !== this.searchRequestId) return;
            this.state.searchResults = results;
            this.state.searchPage = 0;
            this.state.hasMoreSearchResults = results.length === this.state.listingsPageSize;
            this.applyFiltersAndRender();
        } catch (error) {
            if (requestId !== this.searchRequestId) return;
            console.error('Search Error:', error);
            this.renderErrorState(error.message || 'تعذر تنفيذ البحث. حاول مرة أخرى.');
        } finally {
            if (requestId === this.searchRequestId) {
                this.state.isSearching = false;
                if (searchInput) searchInput.disabled = false;
                if (searchButton) searchButton.disabled = false;
                searchInput?.focus();
            }
        }
    }

    renderListings(items) {
        const feedContainer = document.getElementById('listingsFeed');
        const countContainer = document.getElementById('resultsCount');

        if (countContainer) {
            const resultLabel = items.length === 1 ? 'نتيجة' : 'نتائج';
            countContainer.innerHTML = this.state.searchResults === null
                ? `عرض <span>${items.length}</span> إعلان متاح`
                : `وجدنا <span>${items.length}</span> ${resultLabel} قريبة من «${escapeHTML(this.state.searchQuery)}»`;
        }

        if (!feedContainer) return;
        const loadMoreButton = document.getElementById('loadMoreListingsButton');
        if (loadMoreButton) {
            const hasMore = this.state.searchResults === null
                ? this.state.hasMoreListings
                : this.state.hasMoreSearchResults;
            loadMoreButton.hidden = this.state.showFavoritesOnly || !hasMore;
        }

        if (items.length === 0) {
            feedContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: white; border-radius: 18px; border: 1px dashed var(--border-color);">
                    <i class="fa-solid fa-magnifying-glass-minus" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px;"></i>
                    <h3 style="font-size: 20px; font-weight: 800; margin-bottom: 8px;">لا توجد إعلانات مطابقة</h3>
                    <p style="color: var(--text-muted); margin-bottom: 16px;">${this.state.searchQuery.trim() ? 'جرّب كتابة كلمات أقصر أو اسم القسم أو المدينة.' : 'لا توجد إعلانات في هذا القسم حاليًا.'}</p>
                    <button type="button" class="btn btn-outline" onclick="app.clearFilters()">عرض جميع الإعلانات</button>
                </div>
            `;
            return;
        }

        feedContainer.className = 'listings-grid list-view';
        feedContainer.innerHTML = items.map(item => {
            const isFav = this.favorites.includes(item.id);
            const badgeClass = item.isFree ? 'badge-freebie' : `badge-${item.category}`;
            const badgeText = item.isFree ? 'إهداء مجاني' : item.subCategory;
            const hasListingImage = item.images?.[0] && item.images[0] !== DEFAULT_LISTING_IMAGE;

            return `
                <article class="listing-card" data-listing-id="${escapeHTML(item.id)}">
                    <a class="listing-card-main-link" href="listing.html?id=${encodeURIComponent(item.id)}" aria-label="عرض إعلان ${escapeHTML(item.title)}">
                        <div class="listing-thumb-wrap">
                            <img src="${escapeHTML(safeHttpUrl(item.images[0], DEFAULT_LISTING_IMAGE))}" alt="${hasListingImage ? escapeHTML(item.title) : 'لا توجد صورة مرفوعة لهذا الإعلان'}" class="listing-thumb" loading="lazy" onerror="this.src='${DEFAULT_LISTING_IMAGE}'">
                        </div>
                        <div class="listing-body">
                            <div class="listing-card-meta-row">
                                <span class="badge-tag listing-card-category ${escapeHTML(badgeClass)}">${escapeHTML(badgeText)}</span>
                            </div>
                            <h3 class="listing-card-title">${escapeHTML(item.title)}</h3>
                            <div class="listing-location-tag">
                                <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
                                <span>${escapeHTML([item.city, item.neighborhood].filter(Boolean).join(' - '))}</span>
                            </div>
                            <div class="listing-footer-info">
                                <span class="listing-seller-name"><i class="fa-regular fa-user" aria-hidden="true"></i> ${escapeHTML(item.seller?.name || 'معلن')}</span>
                                <time class="listing-published-date"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${escapeHTML(item.timeAgo)}</time>
                            </div>
                        </div>
                    </a>
                    <button type="button" class="btn-fav-card ${isFav ? 'active' : ''}" data-favorite-id="${escapeHTML(item.id)}" aria-label="${isFav ? 'إزالة الإعلان من المفضلة' : 'إضافة الإعلان إلى المفضلة'}" aria-pressed="${isFav}"><i class="fa-${isFav ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i></button>
                </article>
            `;
        }).join('');
    }

    async loadMoreListings() {
        const button = document.getElementById('loadMoreListingsButton');
        const isSearchMode = this.state.searchResults !== null;
        const hasMore = isSearchMode ? this.state.hasMoreSearchResults : this.state.hasMoreListings;
        if (!hasMore || button?.disabled) return;
        if (button) {
            button.disabled = true;
            button.textContent = 'جاري تحميل المزيد...';
        }
        try {
            const nextPage = isSearchMode ? this.state.searchPage + 1 : this.state.listingsPage + 1;
            const nextListings = isSearchMode
                ? await finnDB.searchListings(this.state.searchQuery, nextPage, this.state.listingsPageSize)
                : await finnDB.getListings(nextPage, this.state.listingsPageSize);
            const target = isSearchMode ? this.state.searchResults : this.listings;
            const knownIds = new Set(target.map(item => item.id));
            target.push(...nextListings.filter(item => !knownIds.has(item.id)));
            if (isSearchMode) {
                this.state.searchPage = nextPage;
                this.state.hasMoreSearchResults = nextListings.length === this.state.listingsPageSize;
            } else {
                this.state.listingsPage = nextPage;
                this.state.hasMoreListings = nextListings.length === this.state.listingsPageSize;
            }
            this.applyFiltersAndRender();
        } catch (error) {
            alert(error.message || 'تعذر تحميل المزيد من الإعلانات.');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = 'تحميل المزيد من الإعلانات';
                button.hidden = isSearchMode
                    ? !this.state.hasMoreSearchResults
                    : !this.state.hasMoreListings;
            }
        }
    }

    clearFilters() {
        this.searchRequestId += 1;
        this.state.category = 'all';
        this.state.searchQuery = '';
        this.state.searchResults = null;
        this.state.searchPage = 0;
        this.state.hasMoreSearchResults = false;
        this.state.isSearching = false;
        this.state.showFavoritesOnly = false;
        const searchInput = document.getElementById('globalSearch');
        if (searchInput) {
            searchInput.value = '';
            searchInput.disabled = false;
        }
        const searchButton = document.getElementById('globalSearchButton');
        if (searchButton) searchButton.disabled = false;
        this.renderCategoryBar();
        this.applyFiltersAndRender();
        searchInput?.focus();
    }

    async toggleFav(id) {
        if (this.favoriteUpdates.has(id)) return;
        this.favoriteUpdates.add(id);
        try {
            this.favorites = await finnDB.toggleFavorite(id);
            this.updateHeaderBadges();
            this.applyFiltersAndRender();
        } catch (error) {
            alert(error.message || 'تعذر تحديث المفضلة.');
        } finally {
            this.favoriteUpdates.delete(id);
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            modal.inert = true;
            modal.hidden = true;
            const returnTarget = this.modalFocusOrigins.get(modalId);
            if (returnTarget?.isConnected) returnTarget.focus();
            this.modalFocusOrigins.delete(modalId);
        }
        if (modalId === 'chatModal' && this.chatPollTimer) {
            window.clearInterval(this.chatPollTimer);
            this.chatPollTimer = null;
        }
    }

    showModal(modalId, initialFocusSelector = null) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        this.modalFocusOrigins.set(modalId, document.activeElement);
        modal.hidden = false;
        modal.inert = false;
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('active');
        window.setTimeout(() => {
            const initialFocus = initialFocusSelector ? modal.querySelector(initialFocusSelector) : null;
            (initialFocus || modal.querySelector('input, select, textarea, button, [href]') || modal.querySelector('.modal-box'))?.focus();
        }, 0);
    }

    async openPostAdModal() {
        const authUser = await finnDB.getAuthUser();
        if (!authUser) {
            this.openAuthModal('postAdGuard');
            return;
        }

        this.resetAdFormState();
        this.showModal('postAdModal', '[name="adTitle"]');
    }

    async openEditAdModal(listingId) {
        const authUser = await finnDB.getAuthUser();
        const listing = this.listings.find(item => item.id === listingId);
        if (!authUser || !listing || listing.userId !== authUser.id) {
            alert('لا تملك صلاحية تعديل هذا الإعلان.');
            return;
        }

        const form = document.getElementById('adForm');
        this.state.editingListingId = listingId;
        this.state.uploadedImages = [...listing.images].slice(0, MAX_LISTING_IMAGES);
        form.adTitle.value = listing.title;
        form.adCategory.value = listing.category;
        form.adSubCategory.value = listing.subCategory || '';
        form.adCity.value = listing.city;
        form.adNeighborhood.value = listing.neighborhood || '';
        form.adPrice.value = listing.price || '';
        form.adIsFree.checked = listing.isFree;
        this.syncFreePriceField();
        form.adCondition.value = listing.condition;
        form.adDescription.value = listing.description;
        document.getElementById('adModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تعديل الإعلان والصور';
        document.getElementById('adSubmitLabel').textContent = 'حفظ التعديلات';
        document.getElementById('cancelAdEditBtn').style.display = 'block';
        this.renderImagePreviews();
        this.showModal('postAdModal', '[name="adTitle"]');
    }

    resetAdFormState() {
        const form = document.getElementById('adForm');
        form?.reset();
        this.state.editingListingId = null;
        this.state.uploadedImages = [];
        const categorySelect = form?.querySelector('[name="adCategory"]');
        if (categorySelect) categorySelect.value = 'marketplace';
        this.syncFreePriceField();
        document.getElementById('adModalTitle').innerHTML = '<i class="fa-solid fa-plus-circle"></i> نشر إعلان جديد في المنصة';
        document.getElementById('adSubmitLabel').textContent = 'نشر الإعلان';
        document.getElementById('cancelAdEditBtn').style.display = 'none';
        this.renderImagePreviews();
    }

    openAuthModal(reason = 'general') {
        const modal = document.getElementById('realAuthModal');
        const noticeBox = document.getElementById('authNoticeBox');
        
        if (reason === 'postAdGuard') {
            noticeBox.innerHTML = `
                <div style="background: #fef2f2; border: 1.5px solid #ef4444; padding: 14px; border-radius: 12px; margin-bottom: 16px;">
                    <h4 style="color: #991b1b; font-weight: 800; font-size: 14px;"><i class="fa-solid fa-shield-halved"></i> حظر أمني: الحساب الحقيقي مطلوب</h4>
                    <p style="color: #7f1d1d; font-size: 13px; margin-top: 4px;">لا يمكن نشر إعلان بدون تسجيل دخول حقيقي وتوثيق البيانات عبر السيرفر.</p>
                </div>
            `;
        } else if (reason !== 'recovery') {
            noticeBox.innerHTML = '';
        }

        this.switchAuthTab(reason === 'recovery' ? 'recovery' : 'login');
        this.showModal('realAuthModal', reason === 'recovery' ? '[name="newPassword"]' : '[name="loginEmail"]');
    }

    syncFreePriceField() {
        const form = document.getElementById('adForm');
        if (!form) return;
        const isFree = Boolean(form.adIsFree?.checked);
        form.adPrice.disabled = isFree;
        form.adPrice.required = !isFree;
        if (isFree) form.adPrice.value = '0';
    }

    async submitAd(event) {
        event.preventDefault();

        const authUser = await finnDB.getAuthUser();
        if (!authUser) {
            alert('⛔ حظر أمني: يجب تسجيل حساب حقيقي وموثق في Supabase قبل النشر.');
            this.openAuthModal('postAdGuard');
            return;
        }

        const form = event.target;

        const imagesToUse = this.state.uploadedImages.length > 0
            ? [...this.state.uploadedImages]
            : [DEFAULT_LISTING_IMAGE];

        const selectedCategoryText = (form.adCategory && form.adCategory.options[form.adCategory.selectedIndex])
            ? form.adCategory.options[form.adCategory.selectedIndex].text
            : form.adCategory.value;
        const subCategoryText = form.adSubCategory.value.trim() || selectedCategoryText;

        const conditionText = (form.adCondition && form.adCondition.options[form.adCondition.selectedIndex]) 
            ? form.adCondition.options[form.adCondition.selectedIndex].text 
            : 'استعمال نظيف';

        const adValues = {
            id: 'list-' + Date.now(),
            title: form.adTitle.value,
            category: form.adCategory.value,
            subCategory: subCategoryText,
            price: form.adIsFree.checked ? 0 : parseFloat(form.adPrice.value || 0),
            isFree: form.adIsFree.checked,
            city: form.adCity.value,
            neighborhood: form.adNeighborhood.value.trim(),
            condition: form.adCondition.value,
            timeAgo: 'الآن',
            views: 1,
            favoritesCount: 0,
            images: imagesToUse,
            seller: {
                name: authUser.name || 'عضو موثق',
                avatar: authUser.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
                phone: authUser.phone || '',
                rating: 0,
                verified: authUser.verified
            },
            specs: Object.assign({
                'الحالة': conditionText,
                'المنطقة': form.adCity.value
            }, form.adNeighborhood.value.trim() ? { 'الحي': form.adNeighborhood.value.trim() } : {}),
            description: form.adDescription.value,
            comments: []
        };

        const wasEditing = Boolean(this.state.editingListingId);
        this.setFormLoading(form, true, wasEditing ? 'جاري حفظ التعديلات والصور...' : 'جاري نشر الإعلان والصور...');
        try {
            if (wasEditing) {
                const updated = await finnDB.updateListing(this.state.editingListingId, adValues);
                this.listings = this.listings.map(item => item.id === updated.id ? updated : item);
            } else {
                const saved = await finnDB.saveListing(adValues);
                this.listings.unshift(saved);
            }
        } catch (error) {
            alert(error.message || 'تعذر حفظ الإعلان أو تعديل بياناته.');
            return;
        } finally {
            this.setFormLoading(form, false);
        }
        this.closeModal('postAdModal');
        this.resetAdFormState();
        this.applyFiltersAndRender();
        alert(wasEditing ? 'تم حفظ تعديلات الإعلان والصور بنجاح.' : 'تم نشر الإعلان بنجاح.');
    }

    async openChatsModal(listingId = null) {
        const authUser = await finnDB.getAuthUser();
        if (!authUser) {
            this.state.pendingChatListingId = listingId;
            this.openAuthModal('login');
            return;
        }

        const modal = document.getElementById('chatModal');
        this.showModal('chatModal', '#chatInput');
        try {
            if (listingId) this.state.activeThreadId = await finnDB.openOrCreateChat(listingId);
            const threads = await finnDB.getChatThreads();
            this.renderChatThreads(threads);
            const activeId = this.state.activeThreadId || threads[0]?.id;
            if (activeId) await this.selectChatThread(activeId, threads);
            else this.renderChatMessages([]);
            this.state.pendingChatListingId = null;
            history.replaceState(null, '', window.location.pathname);
            if (this.chatPollTimer) window.clearInterval(this.chatPollTimer);
            this.chatPollTimer = window.setInterval(() => this.refreshChatMessages(), 5000);
        } catch (error) {
            this.renderChatMessages([]);
            alert(error.message || 'تعذر فتح المحادثات.');
        }
    }

    renderChatThreads(threads) {
        const container = document.getElementById('chatThreadList');
        if (!container) return;
        container.innerHTML = threads.length ? threads.map(thread => `
            <button class="chat-thread-item ${thread.id === this.state.activeThreadId ? 'active' : ''}" onclick="app.selectChatThread('${thread.id}')">
                <img src="${escapeHTML(safeHttpUrl(thread.participantAvatar, DEFAULT_AVATAR))}" alt="${escapeHTML(thread.participantName)}">
                <span style="min-width:0;">
                    <strong style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(thread.participantName)}</strong>
                    <small style="display:block; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(thread.listingTitle)}</small>
                    <small style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(thread.lastMessage)}</small>
                </span>
            </button>
        `).join('') : '<p class="chat-empty-state">لا توجد محادثات بعد. افتح إعلانًا واختر مراسلة المعلن.</p>';
    }

    async selectChatThread(threadId, knownThreads = null) {
        this.state.activeThreadId = threadId;
        const threads = knownThreads || await finnDB.getChatThreads();
        this.renderChatThreads(threads);
        const active = threads.find(thread => thread.id === threadId);
        const title = document.getElementById('chatConversationTitle');
        if (title) title.textContent = active ? `${active.participantName} — ${active.listingTitle}` : 'المحادثة';
        await this.refreshChatMessages();
    }

    async refreshChatMessages() {
        if (!this.state.activeThreadId || !document.getElementById('chatModal')?.classList.contains('active')) return;
        try {
            const messages = await finnDB.getThreadMessages(this.state.activeThreadId);
            this.renderChatMessages(messages);
        } catch (error) {
            console.error('Chat refresh error:', error);
        }
    }

    renderChatMessages(messages) {
        const container = document.getElementById('chatMessagesBox');
        if (!container) return;
        container.innerHTML = messages.length ? messages.map(message => `
            <div class="chat-bubble ${message.sender}">
                <div>${escapeHTML(message.text)}</div>
                <span class="chat-message-time">${escapeHTML(message.time)}</span>
            </div>
        `).join('') : '<p class="chat-empty-state">لا توجد رسائل بعد. ابدأ المحادثة برسالة واضحة.</p>';
        container.scrollTop = container.scrollHeight;
    }

    async sendChatMessage() {
        const input = document.getElementById('chatInput');
        const button = document.getElementById('chatSendButton');
        if (!this.state.activeThreadId || !input?.value.trim()) return;
        button.disabled = true;
        try {
            const messages = await finnDB.sendChatMessage(this.state.activeThreadId, input.value);
            input.value = '';
            this.renderChatMessages(messages);
            this.renderChatThreads(await finnDB.getChatThreads());
        } catch (error) {
            alert(error.message || 'تعذر إرسال الرسالة.');
        } finally {
            button.disabled = false;
            input.focus();
        }
    }

    setupEventListeners() {
        document.addEventListener('click', (event) => {
            if (!event.target.closest('#accountMenu')) this.closeAccountMenu();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeAccountMenu();
                document.getElementById('accountMenuButton')?.focus();
            }
        });

        document.getElementById('listingsFeed')?.addEventListener('click', (event) => {
            const favoriteButton = event.target.closest('[data-favorite-id]');
            if (favoriteButton) {
                event.stopPropagation();
                this.toggleFav(favoriteButton.dataset.favoriteId);
                return;
            }
        });

        const searchInput = document.getElementById('globalSearch');
        document.getElementById('globalSearchForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.submitSearch(searchInput?.value || '');
        });
        searchInput?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            this.submitSearch(event.currentTarget.value);
        });

        document.getElementById('catNavList')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            this.state.category = btn.dataset.cat;
            this.state.showFavoritesOnly = false;
            this.renderCategoryBar();
            this.applyFiltersAndRender();
        });

        document.getElementById('adIsFree')?.addEventListener('change', () => this.syncFreePriceField());

        document.addEventListener('keydown', (event) => {
            const modal = document.querySelector('.modal-overlay.active');
            if (!modal) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeModal(modal.id);
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = [...modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
                .filter(element => !element.hidden && element.getClientRects().length);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });

        document.getElementById('chatInput')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.sendChatMessage();
            }
        });

    }
}

// Initialize App on DOM Load
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FinnMarketApp();
});
