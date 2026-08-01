const SUPABASE_URL = 'https://mjuaqlkddmgilmjehwlx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-vcUUwqYtYMGTF-TAHK4jQ_gezyBqMD';
const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';
const DEFAULT_LISTING_IMAGE = 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1200&q=80';

const supabaseClient = (typeof supabase !== 'undefined' && supabase.createClient)
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

class FinnSeniorProductionEngine {
    constructor() {
        this.STORAGE_KEY = 'finn_marketplace_listings_real_prod_v6';
        this.FAVS_KEY = 'finn_marketplace_favs_real_prod_v6';
        this.RATINGS_KEY = 'finn_seller_ratings_v6';
    }

    requireClient() {
        if (!supabaseClient) throw new Error('تعذر تحميل عميل Supabase. تحقق من الاتصال ثم أعد المحاولة.');
        return supabaseClient;
    }

    async getAuthUser() {
        if (!supabaseClient) return null;
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) return null;

        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('full_name, avatar_url, phone_number, role, verified_seller')
            .eq('id', user.id)
            .maybeSingle();

        if (profileError) throw new Error(`تعذر قراءة الملف الشخصي: ${profileError.message}`);
        return {
            id: user.id,
            email: user.email,
            name: profile?.full_name || user.email?.split('@')[0] || 'عضو',
            phone: profile?.phone_number || '',
            avatar: profile?.avatar_url || DEFAULT_AVATAR,
            role: profile?.role || 'user',
            verified: Boolean(profile?.verified_seller)
        };
    }

    async registerRealUser(fullName, email, password, phone) {
        const client = this.requireClient();
        const normEmail = email.trim().toLowerCase();
        const normPhone = phone.trim().replace(/\s+/g, '');
        const normName = fullName.trim();
        const { data, error } = await client.auth.signUp({
            email: normEmail,
            password,
            options: { data: { full_name: normName, phone: normPhone, avatar_url: DEFAULT_AVATAR } }
        });
        if (error) throw new Error(this.translateAuthError(error.message));
        if (!data?.user) throw new Error('فشل Supabase في إنشاء الحساب. حاول مجددًا.');
        return {
            id: data.user.id,
            email: data.user.email,
            name: normName,
            phone: normPhone,
            avatar: DEFAULT_AVATAR,
            role: 'user',
            verified: false,
            requiresEmailConfirmation: !data.session
        };
    }

    async loginRealUser(email, password) {
        const client = this.requireClient();
        const { data, error } = await client.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password
        });
        if (error) throw new Error(this.translateAuthError(error.message));
        if (!data?.user) throw new Error('بيانات الدخول غير صحيحة.');
        return this.getAuthUser();
    }

    async logoutUser() {
        if (!supabaseClient) return;
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw new Error(`تعذر تسجيل الخروج: ${error.message}`);
    }

    translateAuthError(message = '') {
        if (/already registered|already exists/i.test(message)) return 'البريد الإلكتروني مسجل بالفعل.';
        if (/password should be at least/i.test(message)) return 'كلمة المرور أقصر من الحد المطلوب.';
        if (/invalid login credentials/i.test(message)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        if (/rate limit/i.test(message)) return 'تم تجاوز حد المحاولات. انتظر قليلًا ثم أعد المحاولة.';
        return `خطأ في المصادقة: ${message}`;
    }

    mapListing(item) {
        const profile = item.profiles || {};
        return {
            id: item.id,
            userId: item.user_id,
            title: item.title,
            category: item.category_type,
            subCategory: item.sub_category || item.category_type,
            price: Number(item.price || 0),
            isFree: Boolean(item.is_free),
            city: item.city,
            neighborhood: item.neighborhood || '',
            condition: item.condition || 'good',
            status: item.status,
            timeAgo: new Date(item.created_at).toLocaleDateString('ar-SA'),
            views: item.views_count || 0,
            images: Array.isArray(item.images) && item.images.length ? item.images : [DEFAULT_LISTING_IMAGE],
            seller: {
                id: item.user_id,
                name: profile.full_name || 'معلن',
                avatar: profile.avatar_url || DEFAULT_AVATAR,
                phone: '',
                rating: Number(profile.rating || 5),
                verified: Boolean(profile.verified_seller)
            },
            description: item.description,
            specs: item.attributes || {},
            comments: []
        };
    }

    async getListings() {
        if (!supabaseClient) return [...MOCK_LISTINGS];
        const { data, error } = await supabaseClient
            .from('listings')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw new Error(`تعذر جلب الإعلانات: ${error.message}`);
        return (data || []).map((item) => this.mapListing(item));
    }

    async saveListing(newListing) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول قبل نشر الإعلان.');
        const { data, error } = await this.requireClient().from('listings').insert({
            user_id: authUser.id,
            title: newListing.title.trim(),
            description: newListing.description.trim(),
            price: Number(newListing.price || 0),
            is_free: Boolean(newListing.isFree),
            category_type: newListing.category,
            sub_category: newListing.subCategory,
            city: newListing.city,
            neighborhood: newListing.neighborhood || null,
            condition: newListing.condition,
            images: newListing.images,
            attributes: newListing.specs
        }).select('*').single();
        if (error) throw new Error(`فشل حفظ الإعلان: ${error.message}`);
        data.profiles = {
            full_name: authUser.name,
            avatar_url: authUser.avatar,
            phone_number: authUser.phone,
            verified_seller: authUser.verified
        };
        return this.mapListing(data);
    }

    async deleteListing(listingId) {
        const { error } = await this.requireClient().from('listings').delete().eq('id', listingId);
        if (error) throw new Error(`تعذر حذف الإعلان: ${error.message}`);
        return this.getListings();
    }

    async updateListingStatus(listingId, status) {
        if (!['active', 'pending', 'rejected', 'reserved', 'sold'].includes(status)) {
            throw new Error('حالة الإعلان غير صالحة.');
        }
        const { error } = await this.requireClient().from('listings').update({
            status,
            updated_at: new Date().toISOString()
        }).eq('id', listingId);
        if (error) throw new Error(`تعذر تحديث حالة الإعلان: ${error.message}`);
    }

    async deleteComment() {
        throw new Error('حذف التعليقات السحابية غير متاح حتى يتم ربط معرف التعليق.');
    }

    async updateProfile(values) {
        const user = await this.getAuthUser();
        if (!user) throw new Error('يجب تسجيل الدخول.');
        const { error } = await this.requireClient().from('profiles').update({
            full_name: values.name.trim(),
            phone_number: values.phone.trim(),
            avatar_url: values.avatar.trim() || null,
            updated_at: new Date().toISOString()
        }).eq('id', user.id);
        if (error) throw new Error(`تعذر تحديث الملف الشخصي: ${error.message}`);
        return this.getAuthUser();
    }

    async rateSeller(sellerName, ratingScore) {
        let ratingsStore = JSON.parse(localStorage.getItem(this.RATINGS_KEY) || '{}');
        ratingsStore[sellerName] ||= { total: 0, count: 0 };
        ratingsStore[sellerName].total += ratingScore;
        ratingsStore[sellerName].count += 1;
        localStorage.setItem(this.RATINGS_KEY, JSON.stringify(ratingsStore));
        return { avg: Number((ratingsStore[sellerName].total / ratingsStore[sellerName].count).toFixed(1)), count: ratingsStore[sellerName].count };
    }

    getFavorites() {
        try { return JSON.parse(localStorage.getItem(this.FAVS_KEY)) || []; } catch (_) { return []; }
    }

    toggleFavorite(id) {
        const current = this.getFavorites();
        const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
        localStorage.setItem(this.FAVS_KEY, JSON.stringify(next));
        return next;
    }

    getChats() { return []; }
}

const finnDB = new FinnSeniorProductionEngine();
