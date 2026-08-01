// Senior Production Engineer Controller for FinnMarket
// Connected Live to Supabase Auth & Real PostgreSQL Database

class FinnMarketApp {
    constructor() {
        this.listings = [];
        this.favorites = finnDB.getFavorites();
        this.chats = finnDB.getChats();
        
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
            activeAuthTab: 'login'
        };

        this.init();
    }

    async init() {
        this.listings = await finnDB.getListings();
        this.renderCategoryBar();
        this.renderCityOptions();
        this.applyFiltersAndRender();
        this.setupEventListeners();
        await this.updateHeaderBadges();
        await this.renderAuthNavHeader();
    }

    async renderAuthNavHeader() {
        const navActions = document.querySelector('.nav-actions');
        if (!navActions) return;

        const authUser = await finnDB.getAuthUser();

        if (authUser) {
            navActions.innerHTML = `
                <button class="btn btn-outline btn-icon" id="btnHeaderFavs" title="الإعلانات المفضلة">
                    <i class="fa-regular fa-heart"></i>
                    <span class="badge-count" id="favBadge" style="display: none;">0</span>
                </button>

                <button class="btn btn-outline btn-icon" onclick="app.openChatForListing('list-101')" title="المحادثات المباشرة">
                    <i class="fa-regular fa-comments"></i>
                    <span class="badge-count">1</span>
                </button>
                
                <div class="user-profile-btn" onclick="app.toggleUserMenu()" title="حسابي الموثق السحابي">
                    <img src="${authUser.avatar}" class="user-avatar-head">
                    <span style="font-size: 13px; font-weight: 700; color: var(--text-main);">${authUser.name}</span>
                    <i class="fa-solid fa-angle-down" style="font-size: 11px; color: var(--text-muted);"></i>
                </div>

                <button class="btn btn-primary" onclick="app.openPostAdModal()">
                    <i class="fa-solid fa-circle-plus"></i>
                    <span>أضف إعلانك</span>
                </button>
            `;
        } else {
            navActions.innerHTML = `
                <button class="btn btn-outline btn-icon" id="btnHeaderFavs" title="الإعلانات المفضلة">
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

    async toggleUserMenu() {
        if (confirm('هل ترغب في تسجيل الخروج من حسابك الموثق في Supabase؟')) {
            await this.handleLogout();
        }
    }

    async handleLogout() {
        await finnDB.logoutUser();
        alert('تم تسجيل الخروج كلياً من السيرفر بنجاح.');
        await this.renderAuthNavHeader();
    }

    switchAuthTab(tab) {
        this.state.activeAuthTab = tab;
        const loginForm = document.getElementById('loginAuthForm');
        const regForm = document.getElementById('registerAuthForm');
        const tabLoginBtn = document.getElementById('tabLoginBtn');
        const tabRegBtn = document.getElementById('tabRegisterBtn');

        if (tab === 'login') {
            loginForm.style.display = 'block';
            regForm.style.display = 'none';
            tabLoginBtn.classList.add('active');
            tabRegBtn.classList.remove('active');
        } else {
            loginForm.style.display = 'none';
            regForm.style.display = 'block';
            tabLoginBtn.classList.remove('active');
            tabRegBtn.classList.add('active');
        }
    }

    async handleRealLogin(event) {
        event.preventDefault();
        const form = event.target;
        const email = form.loginEmail.value.trim();
        const password = form.loginPassword.value.trim();

        try {
            const user = await finnDB.loginRealUser(email, password);
            this.closeModal('realAuthModal');
            await this.renderAuthNavHeader();
            alert(`🎉 تم التحقق وتسجيل الدخول بنجاح لحساب (${user.name}) عبر سيرفر Supabase!`);
        } catch (err) {
            alert('⚠️ ' + err.message);
        }
    }

    async handleRealRegister(event) {
        event.preventDefault();
        const form = event.target;
        const name = form.regName.value.trim();
        const email = form.regEmail.value.trim();
        const password = form.regPassword.value.trim();
        const phone = form.regPhone.value.trim();

        try {
            const user = await finnDB.registerRealUser(name, email, password, phone);
            this.closeModal('realAuthModal');
            await this.renderAuthNavHeader();
            alert(`🎉 تم إنشاء وتوثيق حسابك السحابي بنجاح باسم (${name})!`);
        } catch (err) {
            alert('⚠️ ' + err.message);
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

        const filterOptionsHTML = INITIAL_CITIES.map(c => `<option value="${c}">${c}</option>`).join('');
        const postAdOptionsHTML = INITIAL_CITIES.filter(c => c !== 'جميع المدن').map(c => `<option value="${c}">${c}</option>`).join('');

        if (citySelect) {
            citySelect.innerHTML = filterOptionsHTML;
        }
        if (postAdCitySelect) {
            postAdCitySelect.innerHTML = postAdOptionsHTML;
        }
    }

    handleImageFileUpload(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        files.forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                this.state.uploadedImages.push(e.target.result);
                this.renderImagePreviews();
            };
            reader.readAsDataURL(file);
        });
    }

    renderImagePreviews() {
        const container = document.getElementById('imagePreviewContainer');
        if (!container) return;

        container.innerHTML = this.state.uploadedImages.map((imgDataUrl, idx) => `
            <div class="preview-thumb-card">
                <img src="${imgDataUrl}" alt="صورة الإعلان ${idx + 1}">
                <button class="remove-thumb-btn" onclick="event.stopPropagation(); app.removeUploadedImage(${idx})" title="حذف الصورة">
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
                <div class="listing-card" onclick="window.location.href='listing.html?id=${item.id}'">
                    <div class="listing-thumb-wrap">
                        <img src="${item.images[0]}" alt="${item.title}" class="listing-thumb" loading="lazy">
                        <span class="badge-tag ${badgeClass}">${badgeText}</span>
                        <button class="btn-fav-card ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); app.toggleFav('${item.id}')">
                            <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i>
                        </button>
                    </div>
                    <div class="listing-body">
                        <div class="listing-meta-sub">
                            <i class="fa-solid fa-location-dot"></i>
                            <span>${item.city} - ${item.neighborhood || ''}</span>
                        </div>
                        <h3 class="listing-card-title">${item.title}</h3>
                        <div class="listing-price-tag ${item.isFree ? 'free' : ''}">${formattedPrice}</div>
                        <div class="listing-footer-info">
                            <span><i class="fa-regular fa-clock"></i> ${item.timeAgo}</span>
                            <span><i class="fa-regular fa-eye"></i> ${item.views} مشاهدة</span>
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

        this.state.uploadedImages = [];
        this.renderImagePreviews();
        document.getElementById('postAdModal').classList.add('active');
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
        } else {
            noticeBox.innerHTML = '';
        }

        this.switchAuthTab('login');
        modal.classList.add('active');
    }

    async submitNewAd(event) {
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

        const newAd = {
            id: 'list-' + Date.now(),
            title: form.adTitle.value,
            category: form.adCategory.value,
            subCategory: form.adCategory.options[form.adCategory.selectedIndex].text,
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
                'الحالة': form.adCondition.options[form.adCondition.selectedIndex].text,
                'المنطقة': form.adCity.value
            },
            description: form.adDescription.value,
            comments: []
        };

        await finnDB.saveListing(newAd);
        this.listings = await finnDB.getListings();
        this.closeModal('postAdModal');
        form.reset();
        this.state.uploadedImages = [];
        this.renderImagePreviews();
        this.applyFiltersAndRender();
        alert('🎉 تم إرسال وحفظ إعلانك الحقيقي بنجاح في قاعدة بيانات Supabase السحابية!');
    }

    async openChatForListing(listingId) {
        const authUser = await finnDB.getAuthUser();
        if (!authUser) {
            this.openAuthModal('postAdGuard');
            return;
        }

        const modal = document.getElementById('chatModal');
        const chatContainer = document.getElementById('chatMessagesBox');
        
        const chatData = finnDB.getChats()[0];
        if (chatContainer && chatData) {
            chatContainer.innerHTML = chatData.messages.map(m => `
                <div class="chat-bubble ${m.sender}">
                    <div>${m.text}</div>
                    <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">${m.time}</div>
                </div>
            `).join('');
        }

        modal.classList.add('active');
    }

    sendChatMessage() {
        const input = document.getElementById('chatInput');
        if (!input || !input.value.trim()) return;

        finnDB.addMessage('chat-1', input.value.trim());
        input.value = '';

        const chatContainer = document.getElementById('chatMessagesBox');
        const chatData = finnDB.getChats()[0];
        if (chatContainer && chatData) {
            chatContainer.innerHTML = chatData.messages.map(m => `
                <div class="chat-bubble ${m.sender}">
                    <div>${m.text}</div>
                    <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">${m.time}</div>
                </div>
            `).join('');
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    setupEventListeners() {
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

        document.getElementById('btnHeaderFavs')?.addEventListener('click', () => {
            this.state.showFavoritesOnly = !this.state.showFavoritesOnly;
            this.applyFiltersAndRender();
        });
    }
}

// Initialize App on DOM Load
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new FinnMarketApp();
});
