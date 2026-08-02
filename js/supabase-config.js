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

    async registerRealUser(fullName, email, password, phone, emailRedirectTo) {
        const client = this.requireClient();
        const normEmail = email.trim().toLowerCase();
        const normPhone = phone.trim().replace(/\s+/g, '');
        const normName = fullName.trim();
        const { data, error } = await client.auth.signUp({
            email: normEmail,
            password,
            options: {
                emailRedirectTo,
                data: { full_name: normName, phone: normPhone, avatar_url: DEFAULT_AVATAR }
            }
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

    async requestPasswordReset(email, redirectTo) {
        const { error } = await this.requireClient().auth.resetPasswordForEmail(
            email.trim().toLowerCase(),
            { redirectTo }
        );
        if (error) throw new Error(this.translateAuthError(error.message));
    }

    async updateRecoveredPassword(password) {
        const { data: { user } } = await this.requireClient().auth.getUser();
        if (!user) throw new Error('رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.');
        const { error } = await this.requireClient().auth.updateUser({ password });
        if (error) throw new Error(this.translateAuthError(error.message));
    }

    onAuthStateChange(callback) {
        return this.requireClient().auth.onAuthStateChange(callback);
    }

    async logoutUser() {
        if (!supabaseClient) return;
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw new Error(`تعذر تسجيل الخروج: ${error.message}`);
        localStorage.removeItem(this.FAVS_KEY);
    }

    translateAuthError(message = '') {
        if (/already registered|already exists/i.test(message)) return 'البريد الإلكتروني مسجل بالفعل.';
        if (/password should be at least/i.test(message)) return 'كلمة المرور أقصر من الحد المطلوب.';
        if (/invalid login credentials/i.test(message)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        if (/email not confirmed/i.test(message)) return 'يرجى تأكيد بريدك الإلكتروني أولًا، ثم حاول تسجيل الدخول.';
        if (/same password/i.test(message)) return 'اختر كلمة مرور جديدة تختلف عن كلمة المرور الحالية.';
        if (/expired|invalid.*token|otp.*expired/i.test(message)) return 'الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.';
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

    async getListingSeller(userId) {
        if (!userId || !await this.getAuthUser()) return null;
        const { data, error } = await this.requireClient()
            .from('profiles')
            .select('id, full_name, avatar_url, phone_number, rating, verified_seller')
            .eq('id', userId)
            .maybeSingle();
        if (error) throw new Error(`تعذر جلب بيانات المعلن: ${error.message}`);
        if (!data) return null;
        return {
            id: data.id,
            name: data.full_name || 'معلن',
            avatar: data.avatar_url || DEFAULT_AVATAR,
            phone: data.phone_number || '',
            rating: Number(data.rating || 0),
            verified: Boolean(data.verified_seller)
        };
    }

    async getListingComments(listingId) {
        const { data, error } = await this.requireClient()
            .from('comments')
            .select('id, listing_id, user_id, comment_text, is_seller_reply, created_at')
            .eq('listing_id', listingId)
            .order('created_at', { ascending: true });
        if (error) throw new Error(`تعذر جلب الردود: ${error.message}`);

        const authUser = await this.getAuthUser();
        const profileMap = new Map();
        const userIds = [...new Set((data || []).map(comment => comment.user_id))];
        if (authUser && userIds.length) {
            const { data: profiles } = await this.requireClient()
                .from('profiles')
                .select('id, full_name, avatar_url')
                .in('id', userIds);
            (profiles || []).forEach(profile => profileMap.set(profile.id, profile));
        }

        return (data || []).map(comment => {
            const profile = profileMap.get(comment.user_id) || {};
            return {
                id: comment.id,
                userId: comment.user_id,
                author: profile.full_name || 'عضو في FinnMarket',
                avatar: profile.avatar_url || DEFAULT_AVATAR,
                isSeller: Boolean(comment.is_seller_reply),
                text: comment.comment_text,
                time: new Date(comment.created_at).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' })
            };
        });
    }

    async addComment(listingId, commentText, listingOwnerId) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول لإضافة رد.');
        const text = commentText.trim();
        if (!text || text.length > 2000) throw new Error('يجب أن يكون الرد بين 1 و2000 حرف.');
        const { error } = await this.requireClient().from('comments').insert({
            listing_id: listingId,
            user_id: authUser.id,
            comment_text: text,
            is_seller_reply: authUser.id === listingOwnerId
        });
        if (error) throw new Error(`تعذر نشر الرد: ${error.message}`);
        return this.getListingComments(listingId);
    }

    async uploadListingImages(listingId, images, userId) {
        const uploadedPaths = [];
        const urls = [];
        try {
            for (const image of images) {
                if (/^https?:\/\//i.test(image)) {
                    urls.push(image);
                    continue;
                }

                const blob = await fetch(image).then(response => response.blob());
                const extension = ({
                    'image/png': 'png',
                    'image/jpeg': 'jpg',
                    'image/webp': 'webp'
                })[blob.type];
                if (!extension || blob.size > 5 * 1024 * 1024) {
                    throw new Error('إحدى الصور غير مدعومة أو أكبر من 5 ميجابايت.');
                }

                const path = `${userId}/${listingId}/${crypto.randomUUID()}.${extension}`;
                const { error } = await this.requireClient().storage
                    .from('listing-images')
                    .upload(path, blob, { contentType: blob.type, upsert: false });
                if (error) throw error;
                uploadedPaths.push(path);
                const { data } = this.requireClient().storage.from('listing-images').getPublicUrl(path);
                urls.push(data.publicUrl);
            }
            return { urls, uploadedPaths };
        } catch (error) {
            if (uploadedPaths.length) {
                await this.requireClient().storage.from('listing-images').remove(uploadedPaths);
            }
            throw new Error(`تعذر رفع الصور: ${error.message}`);
        }
    }

    storagePathFromUrl(url, userId) {
        try {
            const marker = '/storage/v1/object/public/listing-images/';
            const pathname = new URL(url).pathname;
            if (!pathname.includes(marker)) return null;
            const path = decodeURIComponent(pathname.split(marker)[1]);
            return path.startsWith(`${userId}/`) ? path : null;
        } catch (_) {
            return null;
        }
    }

    async saveListing(newListing) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول قبل نشر الإعلان.');
        if (!INITIAL_CATEGORIES.some(category => category.id === newListing.category && category.id !== 'all')) {
            throw new Error('قسم الإعلان غير صالح.');
        }
        if (!Array.isArray(newListing.images) || newListing.images.length > MAX_LISTING_IMAGES) {
            throw new Error(`الحد الأقصى هو ${MAX_LISTING_IMAGES} صورة لكل إعلان.`);
        }
        const listingId = crypto.randomUUID();
        const imageUpload = await this.uploadListingImages(listingId, newListing.images, authUser.id);
        const images = imageUpload.urls.length ? imageUpload.urls : [DEFAULT_LISTING_IMAGE];
        const { data, error } = await this.requireClient().from('listings').insert({
            id: listingId,
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
            images,
            attributes: newListing.specs
        }).select('*').single();
        if (error) {
            if (imageUpload.uploadedPaths.length) {
                await this.requireClient().storage.from('listing-images').remove(imageUpload.uploadedPaths);
            }
            throw new Error(`فشل حفظ الإعلان: ${error.message}`);
        }
        data.profiles = {
            full_name: authUser.name,
            avatar_url: authUser.avatar,
            phone_number: authUser.phone,
            verified_seller: authUser.verified
        };
        return this.mapListing(data);
    }

    async updateListing(listingId, values) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول قبل تعديل الإعلان.');
        if (!INITIAL_CATEGORIES.some(category => category.id === values.category && category.id !== 'all')) {
            throw new Error('قسم الإعلان غير صالح.');
        }
        if (!Array.isArray(values.images) || values.images.length > MAX_LISTING_IMAGES) {
            throw new Error(`الحد الأقصى هو ${MAX_LISTING_IMAGES} صورة لكل إعلان.`);
        }

        const { data: current, error: currentError } = await this.requireClient()
            .from('listings')
            .select('images')
            .eq('id', listingId)
            .eq('user_id', authUser.id)
            .single();
        if (currentError) throw new Error('تعذر قراءة الإعلان أو أنك لا تملك صلاحية تعديله.');

        const imageUpload = await this.uploadListingImages(listingId, values.images, authUser.id);
        const images = imageUpload.urls.length ? imageUpload.urls : [DEFAULT_LISTING_IMAGE];
        const { data, error } = await this.requireClient().from('listings').update({
            title: values.title.trim(),
            description: values.description.trim(),
            price: Number(values.price || 0),
            is_free: Boolean(values.isFree),
            category_type: values.category,
            sub_category: values.subCategory,
            city: values.city,
            condition: values.condition,
            images,
            attributes: values.specs,
            updated_at: new Date().toISOString()
        }).eq('id', listingId).eq('user_id', authUser.id).select('*').single();

        if (error) {
            if (imageUpload.uploadedPaths.length) {
                await this.requireClient().storage.from('listing-images').remove(imageUpload.uploadedPaths);
            }
            throw new Error(`تعذر تعديل الإعلان: ${error.message}`);
        }

        const retained = new Set(images);
        const removedPaths = (current.images || [])
            .filter(url => !retained.has(url))
            .map(url => this.storagePathFromUrl(url, authUser.id))
            .filter(Boolean);
        if (removedPaths.length) {
            await this.requireClient().storage.from('listing-images').remove(removedPaths);
        }
        data.profiles = {
            full_name: authUser.name,
            avatar_url: authUser.avatar,
            phone_number: authUser.phone,
            verified_seller: authUser.verified
        };
        return this.mapListing(data);
    }

    async deleteListing(listingId) {
        const authUser = await this.getAuthUser();
        const { data: listing } = authUser ? await this.requireClient()
            .from('listings')
            .select('images')
            .eq('id', listingId)
            .eq('user_id', authUser.id)
            .maybeSingle() : { data: null };
        const { error } = await this.requireClient().from('listings').delete().eq('id', listingId);
        if (error) throw new Error(`تعذر حذف الإعلان: ${error.message}`);
        const imagePaths = (listing?.images || [])
            .map(url => this.storagePathFromUrl(url, authUser.id))
            .filter(Boolean);
        if (imagePaths.length) {
            await this.requireClient().storage.from('listing-images').remove(imagePaths);
        }
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

    async getAdminProfiles() {
        const authUser = await this.getAuthUser();
        if (!authUser || authUser.role !== 'admin') throw new Error('غير مصرح بقراءة بيانات الأعضاء.');
        const { data, error } = await this.requireClient().from('profiles')
            .select('id, full_name, phone_number, role, verified_seller, created_at')
            .order('created_at', { ascending: false });
        if (error) throw new Error(`تعذر جلب الأعضاء: ${error.message}`);
        return (data || []).map(profile => ({
            id: profile.id,
            name: profile.full_name || 'عضو',
            phone: profile.phone_number || 'غير مضاف',
            role: profile.role || 'user',
            verified: Boolean(profile.verified_seller),
            createdAt: profile.created_at
        }));
    }

    async deleteComment(listingId, commentId) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول.');
        const { error } = await this.requireClient().from('comments')
            .delete()
            .eq('id', commentId)
            .eq('listing_id', listingId);
        if (error) throw new Error(`تعذر حذف الرد: ${error.message}`);
        return this.getListingComments(listingId);
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

    getFavorites() {
        try { return JSON.parse(localStorage.getItem(this.FAVS_KEY)) || []; } catch (_) { return []; }
    }

    async syncFavorites() {
        const authUser = await this.getAuthUser();
        if (!authUser) return this.getFavorites();
        const { data, error } = await this.requireClient().from('favorites')
            .select('listing_id')
            .eq('user_id', authUser.id);
        if (error) throw new Error(`تعذر مزامنة المفضلة: ${error.message}`);
        const favorites = (data || []).map(item => item.listing_id);
        localStorage.setItem(this.FAVS_KEY, JSON.stringify(favorites));
        return favorites;
    }

    async toggleFavorite(id) {
        const current = this.getFavorites();
        const isFavorite = current.includes(id);
        const authUser = await this.getAuthUser();
        if (authUser) {
            const query = isFavorite
                ? this.requireClient().from('favorites').delete().eq('user_id', authUser.id).eq('listing_id', id)
                : this.requireClient().from('favorites').insert({ user_id: authUser.id, listing_id: id });
            const { error } = await query;
            if (error) throw new Error(`تعذر تحديث المفضلة: ${error.message}`);
        }
        const next = isFavorite ? current.filter((value) => value !== id) : [...current, id];
        localStorage.setItem(this.FAVS_KEY, JSON.stringify(next));
        return next;
    }

}

const finnDB = new FinnSeniorProductionEngine();
