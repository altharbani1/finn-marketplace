// Senior Production Engineer Controller for FinnMarket
// Connected Live to Supabase Auth & Real PostgreSQL Database

class FinnMarketApp {
    constructor() {
        this.listings = [];
        this.favorites = finnDB.getFavorites();
        
        // Active Filters State
        this.state = {
            category: 'all',
            city: 'جميع المدن',
            searchQuery: '',
            minPrice: null,
            maxPrice: null,
            condition: 'all',
            sortBy: 'newest',
            viewMode: 'grid',
            showFavoritesOnly: false,
            currentDetailListing: null,
            activeImageIdx: 0,
            uploadedImages: [],
            editingListingId: null,
            activeAuthTab: 'login',
            isLoading: true
        };

        this.init();
    }

    async init() {
        this.setupAuthLifecycle();
        this.renderLoadingState();
        try {
            this.listings = await finnDB.getListings();
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
        if (queryParams.get('login') === '1') {
            this.openAuthModal();
            history.replaceState(null, '', window.location.pathname);
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
                <p style="color: #7f1d1d; margin-top: 6px;">${msg}</p>
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

                ${authUser.role === 'admin' ? `<a href="admin.html" class="btn btn-outline" style="color: #ef4444; border-color: #fca5a5;" title="لوحة التحكّم الإدارية">
                    <i class="fa-solid fa-shield-halved"></i> الإدارة
                </a>` : ''}

                <div class="user-profile-btn" onclick="window.location.href='profile.html'" title="بروفايلي وإعلاناتي">
                    <img src="${escapeHTML(safeHttpUrl(authUser.avatar, DEFAULT_AVATAR))}" class="user-avatar-head">
                    <span style="font-size: 13px; font-weight: 700; color: var(--text-main);">${escapeHTML(authUser.name)}</span>
                </div>

                <button class="btn btn-outline" style="color: #ef4444; border-color: #fca5a5;" onclick="app.handleLogout()" title="تسجيل الخروج">
                    <i class="fa-solid fa-right-from-bracket"></i> خروج
                </button>

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

    toggleFavoritesFilter() {
        this.state.showFavoritesOnly = !this.state.showFavoritesOnly;
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
            form.reset();
            this.closeModal('realAuthModal');
            await this.renderAuthNavHeader();
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
                <button data-cat="${cat.id}">
                    <i class="fa-solid ${cat.icon}"></i>
                    <span>${cat.name}</span>
                </button>
            </li>
        `).join('');
    }

    renderCityOptions() {
        const citySelect = document.getElementById('filterCity');
        const postAdCitySelect = document.querySelector('select[name="adCity"]');
        const categorySelect = document.querySelector('select[name="adCategory"]');

        const filterOptionsHTML = INITIAL_CITIES.map(c => `<option value="${c}">${c}</option>`).join('');
        const postAdOptionsHTML = INITIAL_CITIES.filter(c => c !== 'جميع المدن').map(c => `<option value="${c}">${c}</option>`).join('');

        if (citySelect) {
            citySelect.innerHTML = filterOptionsHTML;
        }
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

    handleImageFileUpload(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;

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

        acceptedFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.state.uploadedImages.push(e.target.result);
                this.renderImagePreviews();
            };
            reader.readAsDataURL(file);
        });
        event.target.value = '';
    }

    renderImagePreviews() {
        const container = document.getElementById('imagePreviewContainer');
        const countLabel = document.getElementById('imageCountLabel');
        if (!container) return;

        if (countLabel) countLabel.textContent = `${this.state.uploadedImages.length} من ${MAX_LISTING_IMAGES} صورة`;

        container.innerHTML = this.state.uploadedImages.map((imgDataUrl, idx) => `
            <div class="preview-thumb-card">
                <img src="${imgDataUrl}" alt="صورة الإعلان ${idx + 1}">
                <button type="button" class="remove-thumb-btn" onclick="event.stopPropagation(); app.removeUploadedImage(${idx})" title="إزالة الصورة" aria-label="إزالة الصورة ${idx + 1}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `).join('');
    }

    removeUploadedImage(index) {
        this.state.uploadedImages.splice(index, 1);
        this.renderImagePreviews();
    }

    applyFiltersAndRender() {
        let filtered = [...this.listings];

        if (this.state.showFavoritesOnly) {
            filtered = filtered.filter(item => this.favorites.includes(item.id));
        }

        if (this.state.category !== 'all') {
            filtered = filtered.filter(item => item.category === this.state.category);
        }

        if (this.state.city !== 'جميع المدن') {
            filtered = filtered.filter(item => item.city === this.state.city);
        }

        if (this.state.searchQuery.trim() !== '') {
            const q = this.state.searchQuery.toLowerCase();
            filtered = filtered.filter(item => 
                item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                (item.neighborhood && item.neighborhood.toLowerCase().includes(q))
            );
        }

        if (this.state.condition !== 'all') {
            filtered = filtered.filter(item => item.condition === this.state.condition);
        }

        if (this.state.minPrice !== null && !isNaN(this.state.minPrice)) {
            filtered = filtered.filter(item => item.price >= this.state.minPrice);
        }
        if (this.state.maxPrice !== null && !isNaN(this.state.maxPrice)) {
            filtered = filtered.filter(item => item.price <= this.state.maxPrice);
        }

        if (this.state.sortBy === 'price_asc') {
            filtered.sort((a, b) => a.price - b.price);
        } else if (this.state.sortBy === 'price_desc') {
            filtered.sort((a, b) => b.price - a.price);
        } else if (this.state.sortBy === 'popular') {
            filtered.sort((a, b) => b.views - a.views);
        }

        this.renderListings(filtered);
    }

    renderListings(items) {
        const feedContainer = document.getElementById('listingsFeed');
        const countContainer = document.getElementById('resultsCount');

        if (countContainer) {
            countContainer.innerHTML = `عرض <span>${items.length}</span> إعلان متاح`;
        }

        if (!feedContainer) return;

        if (items.length === 0) {
            feedContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: white; border-radius: 18px; border: 1px dashed var(--border-color);">
                    <i class="fa-solid fa-magnifying-glass-minus" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px;"></i>
                    <h3 style="font-size: 20px; font-weight: 800; margin-bottom: 8px;">لم نجد نتائج مطابقة لمحددات البحث</h3>
                    <p style="color: var(--text-muted);">جرب تغيير الفلاتر أو إعادة كتابة الكلمات المفتاحية</p>
                </div>
            `;
            return;
        }

        feedContainer.className = `listings-grid ${this.state.viewMode === 'list' ? 'list-view' : ''}`;
        feedContainer.innerHTML = items.map(item => {
            const isFav = this.favorites.includes(item.id);
            const badgeClass = item.isFree ? 'badge-freebie' : `badge-${item.category}`;
            const badgeText = item.isFree ? 'إهداء مجاني Gis bort' : item.subCategory;
            const formattedPrice = item.isFree ? 'مجاناً 0 ر.س' : `${item.price.toLocaleString('ar-SA')} ر.س`;

            return `
                <div class="listing-card" data-listing-id="${escapeHTML(item.id)}">
                    <div class="listing-thumb-wrap">
                        <img src="${escapeHTML(safeHttpUrl(item.images[0], DEFAULT_LISTING_IMAGE))}" alt="${escapeHTML(item.title)}" class="listing-thumb" loading="lazy" onerror="this.src='${DEFAULT_LISTING_IMAGE}'">
                        <span class="badge-tag ${escapeHTML(badgeClass)}">${escapeHTML(badgeText)}</span>
                        <button class="btn-fav-card ${isFav ? 'active' : ''}" data-favorite-id="${escapeHTML(item.id)}">
                            <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i>
                        </button>
                    </div>
                    <div class="listing-body">
                        <div class="listing-meta-sub">
                            <i class="fa-solid fa-location-dot"></i>
                            <span>${escapeHTML(item.city)} - ${escapeHTML(item.neighborhood || '')}</span>
                        </div>
                        <h3 class="listing-card-title">${escapeHTML(item.title)}</h3>
                        <div class="listing-price-tag ${item.isFree ? 'free' : ''}">${formattedPrice}</div>
                        <div class="listing-footer-info">
                            <span><i class="fa-regular fa-clock"></i> ${escapeHTML(item.timeAgo)}</span>
                            <span><i class="fa-regular fa-eye"></i> ${Number(item.views) || 0} مشاهدة</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    toggleFav(id) {
        this.favorites = finnDB.toggleFavorite(id);
        this.updateHeaderBadges();
        this.applyFiltersAndRender();
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    }

    async openPostAdModal() {
        const authUser = await finnDB.getAuthUser();
        if (!authUser) {
            this.openAuthModal('postAdGuard');
            return;
        }

        this.resetAdFormState();
        document.getElementById('postAdModal')?.classList.add('active');
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
        form.adPrice.value = listing.price || '';
        form.adIsFree.checked = listing.isFree;
        form.adCondition.value = listing.condition;
        form.adDescription.value = listing.description;
        document.getElementById('adModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تعديل الإعلان والصور';
        document.getElementById('adSubmitLabel').textContent = 'حفظ التعديلات';
        document.getElementById('cancelAdEditBtn').style.display = 'block';
        this.renderImagePreviews();
        document.getElementById('postAdModal')?.classList.add('active');
    }

    resetAdFormState() {
        const form = document.getElementById('adForm');
        form?.reset();
        this.state.editingListingId = null;
        this.state.uploadedImages = [];
        const categorySelect = form?.querySelector('[name="adCategory"]');
        if (categorySelect) categorySelect.value = 'marketplace';
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
        modal?.classList.add('active');
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
            : ['https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1200&q=80'];

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
            neighborhood: 'وسط المدينة',
            condition: form.adCondition.value,
            timeAgo: 'الآن',
            views: 1,
            favoritesCount: 0,
            images: imagesToUse,
            seller: {
                name: authUser.name || 'عضو موثق',
                avatar: authUser.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
                phone: authUser.phone || '+966 50 000 0000',
                rating: 5.0,
                verified: true
            },
            specs: {
                'الحالة': conditionText,
                'المنطقة': form.adCity.value
            },
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

    setupEventListeners() {
        document.getElementById('listingsFeed')?.addEventListener('click', (event) => {
            const favoriteButton = event.target.closest('[data-favorite-id]');
            if (favoriteButton) {
                event.stopPropagation();
                this.toggleFav(favoriteButton.dataset.favoriteId);
                return;
            }
            const card = event.target.closest('[data-listing-id]');
            if (card) window.location.href = `listing.html?id=${encodeURIComponent(card.dataset.listingId)}`;
        });

        const searchInput = document.getElementById('globalSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.state.searchQuery = e.target.value;
                this.applyFiltersAndRender();
            });
        }

        document.getElementById('catNavList')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            this.state.category = btn.dataset.cat;
            this.state.showFavoritesOnly = false;
            this.renderCategoryBar();
            this.applyFiltersAndRender();
        });

        document.getElementById('filterCity')?.addEventListener('change', (e) => {
            this.state.city = e.target.value;
            this.applyFiltersAndRender();
        });

        document.getElementById('minPrice')?.addEventListener('input', (e) => {
            this.state.minPrice = parseFloat(e.target.value) || null;
            this.applyFiltersAndRender();
        });
        document.getElementById('maxPrice')?.addEventListener('input', (e) => {
            this.state.maxPrice = parseFloat(e.target.value) || null;
            this.applyFiltersAndRender();
        });

        document.getElementById('sortBy')?.addEventListener('change', (e) => {
            this.state.sortBy = e.target.value;
            this.applyFiltersAndRender();
        });

        document.getElementById('viewGridBtn')?.addEventListener('click', () => {
            this.state.viewMode = 'grid';
            document.getElementById('viewGridBtn').classList.add('active');
            document.getElementById('viewListBtn').classList.remove('active');
            this.applyFiltersAndRender();
        });
        document.getElementById('viewListBtn')?.addEventListener('click', () => {
            this.state.viewMode = 'list';
            document.getElementById('viewListBtn').classList.add('active');
            document.getElementById('viewGridBtn').classList.remove('active');
            this.applyFiltersAndRender();
        });
    }
}

// Initialize App on DOM Load
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FinnMarketApp();
});
