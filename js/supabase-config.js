// Supabase Client Wrapper & Storage Adapter for FinnMarket
// Connected to Supabase Project: mjuaqlkddmgilmjehwlx

const SUPABASE_CONFIG = {
    url: 'https://mjuaqlkddmgilmjehwlx.supabase.co',
    anonKey: 'sb_publishable_-vcUUwqYtYMGTF-TAHK4jQ_gezyBqMD',
    isLive: true
};

class FinnStorageAdapter {
    constructor() {
        this.STORAGE_KEY = 'finn_marketplace_listings';
        this.FAVS_KEY = 'finn_marketplace_favs';
        this.MESSAGES_KEY = 'finn_marketplace_chats';
        this.init();
    }

    init() {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(MOCK_LISTINGS));
        }
        if (!localStorage.getItem(this.FAVS_KEY)) {
            localStorage.setItem(this.FAVS_KEY, JSON.stringify(['list-101', 'list-105']));
        }
        if (!localStorage.getItem(this.MESSAGES_KEY)) {
            localStorage.setItem(this.MESSAGES_KEY, JSON.stringify([
                {
                    threadId: 'chat-1',
                    listingId: 'list-101',
                    listingTitle: 'فيلا مودرن فاخرة مع مسبح وحديقة خاصة',
                    sellerName: 'شركة قمة العقارية',
                    messages: [
                        { sender: 'seller', text: 'أهلاً بك! كيف يمكنني مساعدتك بخصوص الفيلا؟', time: '10:30 ص' },
                        { sender: 'buyer', text: 'مرحباً، هل الفيلا جاهزة للمعاينة اليوم؟', time: '10:32 ص' }
                    ]
                }
            ]));
        }
    }

    getListings() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || MOCK_LISTINGS;
        } catch (e) {
            return MOCK_LISTINGS;
        }
    }

    saveListing(newListing) {
        const listings = this.getListings();
        listings.unshift(newListing);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(listings));
        return newListing;
    }

    getFavorites() {
        try {
            return JSON.parse(localStorage.getItem(this.FAVS_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    toggleFavorite(id) {
        let favs = this.getFavorites();
        if (favs.includes(id)) {
            favs = favs.filter(favId => favId !== id);
        } else {
            favs.push(id);
        }
        localStorage.setItem(this.FAVS_KEY, JSON.stringify(favs));
        return favs;
    }

    getChats() {
        try {
            return JSON.parse(localStorage.getItem(this.MESSAGES_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    addMessage(threadId, text) {
        const chats = this.getChats();
        const chat = chats.find(c => c.threadId === threadId);
        if (chat) {
            chat.messages.push({
                sender: 'buyer',
                text: text,
                time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
            });
            localStorage.setItem(this.MESSAGES_KEY, JSON.stringify(chats));
        }
        return chats;
    }
}

const finnDB = new FinnStorageAdapter();
