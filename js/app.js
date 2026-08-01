// Main Application Controller for FinnMarket (Finn.no Architecture)

class FinnMarketApp {
    constructor() {
        this.listings = finnDB.getListings();
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
            uploadedImages: [] // Array of Data URLs for newly uploaded files
        };

        this.init();
    }

    init() {
        this.renderCategoryBar();
        this.renderCityOptions();
        this.applyFiltersAndRender();
        this.setupEventListeners();
        this.updateHeaderBadges();
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

        // Filter by Favorites
        if (this.state.showFavoritesOnly) {
            filtered = filtered.filter(item => this.favorites.includes(item.id));
        }

        // Filter by Category
        if (this.state.category !== 'all') {
            filtered = filtered.filter(item => item.category === this.state.category);
        }

        // Filter by City
        if (this.state.city !== 'جميع المدن') {
            filtered = filtered.filter(item => item.city === this.state.city);
        }

        // Filter by Search Query
        if (this.state.searchQuery.trim() !== '') {
            const q = this.state.searchQuery.toLowerCase();
            filtered = filtered.filter(item => 
                item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                (item.neighborhood && item.neighborhood.toLowerCase().includes(q))
            );
        }

        // Filter by Condition
        if (this.state.condition !== 'all') {
            filtered = filtered.filter(item => item.condition === this.state.condition);
        }

        // Filter by Price Range
        if (this.state.minPrice !== null && !isNaN(this.state.minPrice)) {
            filtered = filtered.filter(item => item.price >= this.state.minPrice);
        }
        if (this.state.maxPrice !== null && !isNaN(this.state.maxPrice)) {
            filtered = filtered.filter(item => item.price <= this.state.maxPrice);
        }

        // Sorting
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
                <div class="listing-card" onclick="app.openDetailModal('${item.id}')">
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

    openDetailModal(id) {
        const item = this.listings.find(l => l.id === id);
        if (!item) return;

        this.state.currentDetailListing = item;
        this.state.activeImageIdx = 0;

        const modal = document.getElementById('detailModal');
        const modalBody = document.getElementById('detailModalContent');
        if (!modal || !modalBody) return;

        const isFav = this.favorites.includes(item.id);
        const formattedPrice = item.isFree ? 'مجاناً 0 ر.س' : `${item.price.toLocaleString('ar-SA')} ر.س`;

        modalBody.innerHTML = `
            <div class="detail-modal-gallery">
                <img id="detailActiveImg" src="${item.images[0]}" alt="${item.title}">
                ${item.images.length > 1 ? `
                    <div style="position: absolute; bottom: 16px; right: 16px; display: flex; gap: 8px;">
                        ${item.images.map((img, idx) => `
                            <img src="${img}" style="width: 50px; height: 50px; border-radius: 8px; border: 2px solid ${idx === 0 ? '#0063fb' : 'white'}; cursor: pointer; object-fit: cover;" onclick="app.switchDetailImg('${img}', this)">
                        `).join('')}
                    </div>
                ` : ''}
            </div>
            <div class="detail-content">
                <div style="display: flex; justify-content: space-between; align-items: start; gap: 16px;">
                    <div>
                        <span style="font-size: 13px; font-weight: 700; color: var(--color-primary);">${item.subCategory}</span>
                        <h2 style="font-size: 24px; font-weight: 800; margin: 4px 0 8px;">${item.title}</h2>
                        <p style="color: var(--text-muted); font-size: 14px;"><i class="fa-solid fa-location-dot"></i> ${item.city} ${item.neighborhood ? ' - ' + item.neighborhood : ''}</p>
                    </div>
                    <div style="text-align: left;">
                        <div style="font-size: 28px; font-weight: 900; color: var(--color-primary);">${formattedPrice}</div>
                        <button class="btn btn-outline" style="margin-top: 8px;" onclick="app.toggleFav('${item.id}'); app.openDetailModal('${item.id}');">
                            <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart" style="color: ${isFav ? 'var(--color-favorite)' : 'inherit'};"></i>
                            ${isFav ? 'مخزن بالمفضلة' : 'حفظ بالمفضلة'}
                        </button>
                    </div>
                </div>

                <div class="specs-grid">
                    ${Object.entries(item.specs || {}).map(([key, val]) => `
                        <div class="spec-item">
                            <span class="spec-title">${key}</span>
                            <span class="spec-val">${val}</span>
                        </div>
                    `).join('')}
                </div>

                <div style="margin: 24px 0;">
                    <h3 style="font-size: 17px; font-weight: 800; margin-bottom: 8px;">تفاصيل ووصف الإعلان</h3>
                    <p style="color: var(--text-main); line-height: 1.8; white-space: pre-line;">${item.description}</p>
                </div>

                <div class="seller-card-box">
                    <div class="seller-info-meta">
                        <img src="${item.seller.avatar}" class="seller-avatar" alt="${item.seller.name}">
                        <div>
                            <h4 style="font-size: 16px; font-weight: 800;">${item.seller.name} ${item.seller.verified ? '<i class="fa-solid fa-circle-check" style="color: #0063fb;" title="بائع موثوق"></i>' : ''}</h4>
                            <span style="font-size: 13px; color: var(--text-muted);"><i class="fa-solid fa-star" style="color: #f59e0b;"></i> ${item.seller.rating} تقييم التاجر</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <a href="tel:${item.seller.phone}" class="btn btn-outline"><i class="fa-solid fa-phone"></i> اتصال</a>
                        <button class="btn btn-primary" onclick="app.openChatForListing('${item.id}')"><i class="fa-solid fa-comments"></i> محادثة مباشرة</button>
                    </div>
                </div>
            </div>
        `;

        modal.classList.add('active');
    }

    switchDetailImg(src, el) {
        document.getElementById('detailActiveImg').src = src;
        const parent = el.parentElement;
        Array.from(parent.children).forEach(child => child.style.borderColor = 'white');
        el.style.borderColor = '#0063fb';
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    openPostAdModal() {
        this.state.uploadedImages = [];
        this.renderImagePreviews();
        document.getElementById('postAdModal').classList.add('active');
    }

    submitNewAd(event) {
        event.preventDefault();
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
                name: form.sellerName.value || 'بائع جديد',
                avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
                phone: form.sellerPhone.value || '+966 50 000 0000',
                rating: 5.0,
                verified: true
            },
            specs: {
                'الحالة': form.adCondition.options[form.adCondition.selectedIndex].text,
                'المنطقة': form.adCity.value
            },
            description: form.adDescription.value
        };

        finnDB.saveListing(newAd);
        this.listings = finnDB.getListings();
        this.closeModal('postAdModal');
        form.reset();
        this.state.uploadedImages = [];
        this.renderImagePreviews();
        this.applyFiltersAndRender();
        alert('🎉 تم نشر إعلانك وبنظامه الخاص بصورك المرفوعة بنجاح! يظهر الآن فوراً في المنصة.');
    }

    openChatForListing(listingId) {
        this.closeModal('detailModal');
        const modal = document.getElementById('chatModal');
        const chatContainer = document.getElementById('chatMessagesBox');
        
        const chatData = finnDB.getChats()[0]; // Default simulation
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
        // Global Search
        const searchInput = document.getElementById('globalSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.state.searchQuery = e.target.value;
                this.applyFiltersAndRender();
            });
        }

        // Category Subbar clicks
        document.getElementById('catNavList')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            this.state.category = btn.dataset.cat;
            this.state.showFavoritesOnly = false;
            this.renderCategoryBar();
            this.applyFiltersAndRender();
        });

        // City Selector
        document.getElementById('filterCity')?.addEventListener('change', (e) => {
            this.state.city = e.target.value;
            this.applyFiltersAndRender();
        });

        // Price Inputs
        document.getElementById('minPrice')?.addEventListener('input', (e) => {
            this.state.minPrice = parseFloat(e.target.value) || null;
            this.applyFiltersAndRender();
        });
        document.getElementById('maxPrice')?.addEventListener('input', (e) => {
            this.state.maxPrice = parseFloat(e.target.value) || null;
            this.applyFiltersAndRender();
        });

        // Sort By
        document.getElementById('sortBy')?.addEventListener('change', (e) => {
            this.state.sortBy = e.target.value;
            this.applyFiltersAndRender();
        });

        // View Mode Switch
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

        // Favorites Button in Header
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
