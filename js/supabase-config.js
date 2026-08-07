const SUPABASE_URL = 'https://mjuaqlkddmgilmjehwlx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-vcUUwqYtYMGTF-TAHK4jQ_gezyBqMD';
const DEFAULT_AVATAR = 'assets/default-avatar.svg';
const DEFAULT_LISTING_IMAGE = 'assets/no-image.svg';
const LISTING_SELECT_COLUMNS = [
    'id', 'user_id', 'title', 'description', 'price', 'is_free',
    'category_type', 'sub_category', 'condition', 'city', 'neighborhood',
    'status', 'views_count', 'attributes', 'images', 'created_at', 'updated_at'
].join(',');

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

        const { data: profileResult, error: profileError } = await supabaseClient.rpc('get_my_profile');

        if (profileError) throw new Error(`تعذر قراءة الملف الشخصي: ${profileError.message}`);
        const profile = Array.isArray(profileResult) ? profileResult[0] : profileResult;
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
        if (normPhone && !/^(?:\+?966|0)?5\d{8}$/.test(normPhone)) {
            throw new Error('أدخل رقم جوال سعودي صحيحًا أو اترك الحقل فارغًا.');
        }
        const { data, error } = await client.auth.signUp({
            email: normEmail,
            password,
            options: {
                emailRedirectTo,
                data: {
                    full_name: normName,
                    phone: normPhone,
                    avatar_url: DEFAULT_AVATAR,
                    terms_accepted: true,
                    terms_version: '2026-08-07',
                    privacy_version: '2026-08-07',
                    accepted_at: new Date().toISOString()
                }
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

    async requestEmailChange(email, redirectTo) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('أدخل بريدًا إلكترونيًا صحيحًا.');
        const { error } = await this.requireClient().auth.updateUser(
            { email: normalizedEmail },
            { emailRedirectTo: redirectTo }
        );
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

    async requestAccountDeletion(reason = '') {
        const normalizedReason = String(reason || '').trim();
        if (normalizedReason.length > 1000) throw new Error('سبب طلب الحذف يجب ألا يتجاوز 1000 حرف.');
        const { data, error } = await this.requireClient().rpc('request_account_deletion', {
            p_reason: normalizedReason || null
        });
        if (error) throw new Error(`تعذر إرسال طلب حذف الحساب: ${error.message}`);
        return data;
    }

    async getMyAccountDeletionRequest() {
        const { data, error } = await this.requireClient().rpc('get_my_account_deletion_request');
        if (error) throw new Error(`تعذر قراءة حالة طلب حذف الحساب: ${error.message}`);
        return Array.isArray(data) ? (data[0] || null) : data;
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
        const legacySubCategory = String(item.sub_category || item.category_type || '').trim();
        const subCategory = legacySubCategory
            .replace(/^Bil$/i, 'سيارات')
            .replace(/^Gis bort$/i, 'إهداء مجاني')
            .replace(/\s*\((?:Bil|Gis bort)\)\s*/gi, '')
            .trim();
        return {
            id: item.id,
            userId: item.user_id,
            title: item.title,
            category: item.category_type,
            subCategory,
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
                rating: Number(profile.rating || 0),
                verified: Boolean(profile.verified_seller)
            },
            description: item.description,
            specs: item.attributes || {},
            comments: []
        };
    }

    async getListings(page = 0, pageSize = 30) {
        if (!supabaseClient) throw new Error('تعذر تحميل خدمة البيانات. أعد المحاولة بعد التحقق من الاتصال.');
        const safePage = Math.max(0, Number(page) || 0);
        const safeSize = Math.min(100, Math.max(1, Number(pageSize) || 30));
        const from = safePage * safeSize;
        const { data, error } = await supabaseClient
            .from('listings')
            .select(LISTING_SELECT_COLUMNS)
            .order('created_at', { ascending: false })
            .range(from, from + safeSize - 1);
        if (error) throw new Error(`تعذر جلب الإعلانات: ${error.message}`);
        return (data || []).map((item) => this.mapListing(item));
    }

    async getAdminListings() {
        const authUser = await this.getAuthUser();
        if (!authUser || authUser.role !== 'admin') throw new Error('غير مصرح بقراءة جميع الإعلانات.');
        const pageSize = 100;
        const listings = [];
        for (let page = 0; page < 50; page += 1) {
            const batch = await this.getListings(page, pageSize);
            listings.push(...batch);
            if (batch.length < pageSize) break;
        }
        return listings;
    }

    async getListingById(listingId) {
        if (!listingId) return null;
        const { data, error } = await this.requireClient()
            .from('listings')
            .select(LISTING_SELECT_COLUMNS)
            .eq('id', listingId)
            .maybeSingle();
        if (error) throw new Error(`تعذر جلب الإعلان: ${error.message}`);
        return data ? this.mapListing(data) : null;
    }

    async getListingSeller(listingId) {
        if (!listingId || !await this.getAuthUser()) return null;
        const { data, error } = await this.requireClient().rpc('get_listing_contact', {
            p_listing_id: listingId
        });
        if (error) throw new Error(`تعذر جلب بيانات المعلن: ${error.message}`);
        const contact = Array.isArray(data) ? data[0] : data;
        if (!contact) return null;
        return {
            id: contact.id || contact.seller_id,
            name: contact.full_name || 'معلن',
            avatar: contact.avatar_url || DEFAULT_AVATAR,
            phone: contact.phone_number || '',
            rating: Number(contact.rating || 0),
            verified: Boolean(contact.verified_seller)
        };
    }

    async getListingComments(listingId) {
        const [{ data, error }, { data: listing, error: listingError }] = await Promise.all([
            this.requireClient()
                .from('comments')
                .select('id, listing_id, user_id, comment_text, created_at')
                .eq('listing_id', listingId)
                .order('created_at', { ascending: true }),
            this.requireClient()
                .from('listings')
                .select('user_id')
                .eq('id', listingId)
                .maybeSingle()
        ]);
        if (error) throw new Error(`تعذر جلب الردود: ${error.message}`);
        if (listingError) throw new Error(`تعذر التحقق من صاحب الإعلان: ${listingError.message}`);
        const listingOwnerId = listing?.user_id || null;

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
                isSeller: Boolean(listingOwnerId && comment.user_id === listingOwnerId),
                text: comment.comment_text,
                time: new Date(comment.created_at).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' })
            };
        });
    }

    async addComment(listingId, commentText) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول لإضافة رد.');
        const text = commentText.trim();
        if (!text || text.length > 2000) throw new Error('يجب أن يكون الرد بين 1 و2000 حرف.');
        if (!this.hasMeaningfulText(text)) throw new Error('اكتب ردًا واضحًا بدل تكرار الحرف نفسه.');
        const { error } = await this.requireClient().from('comments').insert({
            listing_id: listingId,
            user_id: authUser.id,
            comment_text: text
        });
        if (error) throw new Error(`تعذر نشر الرد: ${error.message}`);
        return this.getListingComments(listingId);
    }

    async getChatThreads() {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول لعرض المحادثات.');
        const { data, error } = await this.requireClient().from('chat_threads')
            .select('id, listing_id, buyer_id, seller_id, last_message, updated_at')
            .order('updated_at', { ascending: false });
        if (error) throw new Error(`تعذر جلب المحادثات: ${error.message}`);

        const threads = data || [];
        const listingIds = [...new Set(threads.map(thread => thread.listing_id))];
        const participantIds = [...new Set(threads.flatMap(thread => [thread.buyer_id, thread.seller_id]))];
        const [{ data: listings }, { data: profiles }] = await Promise.all([
            listingIds.length
                ? this.requireClient().from('listings').select('id, title').in('id', listingIds)
                : Promise.resolve({ data: [] }),
            participantIds.length
                ? this.requireClient().from('profiles').select('id, full_name, avatar_url').in('id', participantIds)
                : Promise.resolve({ data: [] })
        ]);
        const listingMap = new Map((listings || []).map(listing => [listing.id, listing]));
        const profileMap = new Map((profiles || []).map(profile => [profile.id, profile]));
        return threads.map(thread => {
            const otherId = thread.buyer_id === authUser.id ? thread.seller_id : thread.buyer_id;
            const other = profileMap.get(otherId) || {};
            return {
                id: thread.id,
                listingId: thread.listing_id,
                listingTitle: listingMap.get(thread.listing_id)?.title || 'إعلان غير متاح',
                participantName: other.full_name || 'عضو',
                participantAvatar: other.avatar_url || DEFAULT_AVATAR,
                lastMessage: thread.last_message || 'ابدأ المحادثة الآن',
                updatedAt: thread.updated_at
            };
        });
    }

    async openOrCreateChat(listingId) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول لمراسلة المعلن.');
        const { data: listing, error: listingError } = await this.requireClient().from('listings')
            .select('id, user_id, title')
            .eq('id', listingId)
            .single();
        if (listingError || !listing) throw new Error('الإعلان غير متاح للمراسلة.');
        if (listing.user_id === authUser.id) throw new Error('لا يمكنك مراسلة نفسك على إعلانك.');

        const { data: existing, error: lookupError } = await this.requireClient().from('chat_threads')
            .select('id')
            .eq('listing_id', listing.id)
            .eq('buyer_id', authUser.id)
            .eq('seller_id', listing.user_id)
            .maybeSingle();
        if (lookupError) throw new Error(`تعذر فتح المحادثة: ${lookupError.message}`);
        if (existing) return existing.id;

        const { data: created, error } = await this.requireClient().from('chat_threads').insert({
            listing_id: listing.id,
            buyer_id: authUser.id,
            seller_id: listing.user_id
        }).select('id').single();
        if (error?.code === '23505') {
            const { data: racedThread, error: racedError } = await this.requireClient().from('chat_threads')
                .select('id')
                .eq('listing_id', listing.id)
                .eq('buyer_id', authUser.id)
                .eq('seller_id', listing.user_id)
                .single();
            if (!racedError && racedThread) return racedThread.id;
        }
        if (error) throw new Error(`تعذر إنشاء المحادثة: ${error.message}`);
        return created.id;
    }

    async getThreadMessages(threadId) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول.');
        const { data, error } = await this.requireClient().from('messages')
            .select('id, sender_id, message_text, is_read, created_at')
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true });
        if (error) throw new Error(`تعذر جلب الرسائل: ${error.message}`);
        await this.requireClient().from('messages').update({ is_read: true })
            .eq('thread_id', threadId)
            .neq('sender_id', authUser.id)
            .eq('is_read', false);
        return (data || []).map(message => ({
            id: message.id,
            sender: message.sender_id === authUser.id ? 'sent' : 'received',
            text: message.message_text,
            time: new Date(message.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })
        }));
    }

    async sendChatMessage(threadId, messageText) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول.');
        const text = messageText.trim();
        if (!text || text.length > 2000) throw new Error('يجب أن تكون الرسالة بين 1 و2000 حرف.');
        const { error } = await this.requireClient().from('messages').insert({
            thread_id: threadId,
            sender_id: authUser.id,
            message_text: text
        });
        if (error) throw new Error(`تعذر إرسال الرسالة: ${error.message}`);
        return this.getThreadMessages(threadId);
    }

    async getSellerRating(sellerId) {
        if (!sellerId) return { average: 0, count: 0 };
        const { data, error } = await this.requireClient().from('seller_ratings')
            .select('rating')
            .eq('seller_id', sellerId);
        if (error) throw new Error(`تعذر جلب تقييم المعلن: ${error.message}`);
        const ratings = (data || []).map(item => Number(item.rating));
        const average = ratings.length
            ? Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1))
            : 0;
        return { average, count: ratings.length };
    }

    async rateSeller(listingId, sellerId, rating) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول لإضافة تقييم.');
        if (authUser.id === sellerId) throw new Error('لا يمكنك تقييم نفسك.');
        const score = Number(rating);
        if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('التقييم غير صالح.');
        const { error } = await this.requireClient().rpc('upsert_seller_rating', {
            p_listing_id: listingId,
            p_seller_id: sellerId,
            p_rating: score
        });
        if (error) throw new Error(`تعذر حفظ التقييم: ${error.message}`);
        return this.getSellerRating(sellerId);
    }

    async submitReport(listingId, reason) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول لإرسال بلاغ.');
        const reportReason = reason.trim();
        if (!reportReason || reportReason.length > 2000) throw new Error('اكتب سببًا واضحًا لا يتجاوز 2000 حرف.');
        const { error } = await this.requireClient().from('reports').insert({
            listing_id: listingId,
            reporter_id: authUser.id,
            reason: reportReason
        });
        if (error?.code === '23505') throw new Error('لديك بلاغ قيد المراجعة على هذا الإعلان بالفعل.');
        if (error) throw new Error(`تعذر إرسال البلاغ: ${error.message}`);
    }

    async uploadListingImages(listingId, images, userId) {
        const uploadedPaths = [];
        const urls = [];
        try {
            for (const image of images) {
                if (typeof image === 'string' && /^https?:\/\//i.test(image)) {
                    urls.push(image);
                    continue;
                }

                let blob;
                if (typeof Blob !== 'undefined' && image instanceof Blob) {
                    blob = image;
                } else if (typeof image === 'string' && /^data:image\//i.test(image)) {
                    const response = await fetch(image);
                    if (!response.ok) throw new Error('تعذر قراءة إحدى الصور المختارة.');
                    blob = await response.blob();
                } else {
                    throw new Error('إحدى الصور ليست ملفاً أو رابطاً مدعوماً.');
                }
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
                    .upload(path, blob, { cacheControl: '31536000', contentType: blob.type, upsert: false });
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

    validateListing(values) {
        const title = String(values?.title || '').trim();
        const description = String(values?.description || '').trim();
        const subCategory = String(values?.subCategory || '').trim();
        const city = String(values?.city || '').trim();
        const condition = String(values?.condition || 'good');
        const isFree = Boolean(values?.isFree);
        const price = isFree ? 0 : Number(values?.price);
        const images = Array.isArray(values?.images) ? values.images : [];

        if (title.length < 3 || title.length > 120) {
            throw new Error('عنوان الإعلان يجب أن يكون بين 3 و120 حرفاً.');
        }
        if (description.length < 10 || description.length > 5000) {
            throw new Error('وصف الإعلان يجب أن يكون بين 10 و5000 حرف.');
        }
        if (!this.hasMeaningfulText(title) || !this.hasMeaningfulText(description)) {
            throw new Error('اكتب عنوانًا ووصفًا واضحين بدل تكرار الحرف نفسه.');
        }
        if (subCategory.length > 80) throw new Error('التصنيف الفرعي يجب ألا يتجاوز 80 حرفاً.');
        if (!INITIAL_CATEGORIES.some(category => category.id === values.category && category.id !== 'all')) {
            throw new Error('قسم الإعلان غير صالح.');
        }
        if (!INITIAL_CITIES.includes(city) || city === 'جميع المدن') throw new Error('مدينة الإعلان غير صالحة.');
        if (!['new', 'like_new', 'good', 'fair', 'for_parts'].includes(condition)) {
            throw new Error('حالة المنتج غير صالحة.');
        }
        if (!Number.isFinite(price) || price < 0 || price > 9999999999.99) {
            throw new Error('سعر الإعلان غير صالح.');
        }
        if (images.length > MAX_LISTING_IMAGES) {
            throw new Error(`الحد الأقصى هو ${MAX_LISTING_IMAGES} صورة لكل إعلان.`);
        }
        images.forEach(image => {
            const isBlob = typeof Blob !== 'undefined' && image instanceof Blob;
            const isSupportedUrl = typeof image === 'string' && /^(https?:\/\/|data:image\/)/i.test(image);
            if (!isBlob && !isSupportedUrl) throw new Error('إحدى صور الإعلان غير صالحة.');
            if (isBlob && image.size > 5 * 1024 * 1024) throw new Error('إحدى الصور أكبر من 5 ميجابايت.');
        });

        return {
            ...values,
            title,
            description,
            subCategory,
            city,
            condition,
            isFree,
            price,
            images
        };
    }

    hasMeaningfulText(value) {
        const characters = [...String(value || '').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '')];
        return characters.length < 8 || new Set(characters).size >= 3;
    }

    async saveListing(newListing) {
        const authUser = await this.getAuthUser();
        if (!authUser) throw new Error('يجب تسجيل الدخول قبل نشر الإعلان.');
        const listing = this.validateListing(newListing);
        const listingId = crypto.randomUUID();
        const imageUpload = await this.uploadListingImages(listingId, listing.images, authUser.id);
        const images = imageUpload.urls.length ? imageUpload.urls : [DEFAULT_LISTING_IMAGE];
        const { data, error } = await this.requireClient().from('listings').insert({
            id: listingId,
            user_id: authUser.id,
            title: listing.title,
            description: listing.description,
            price: listing.price,
            is_free: listing.isFree,
            category_type: listing.category,
            sub_category: listing.subCategory,
            city: listing.city,
            neighborhood: listing.neighborhood || null,
            condition: listing.condition,
            images,
            attributes: listing.specs
        }).select(LISTING_SELECT_COLUMNS).single();
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
        const listing = this.validateListing(values);

        const { data: current, error: currentError } = await this.requireClient()
            .from('listings')
            .select('images')
            .eq('id', listingId)
            .eq('user_id', authUser.id)
            .single();
        if (currentError) throw new Error('تعذر قراءة الإعلان أو أنك لا تملك صلاحية تعديله.');

        const imageUpload = await this.uploadListingImages(listingId, listing.images, authUser.id);
        const images = imageUpload.urls.length ? imageUpload.urls : [DEFAULT_LISTING_IMAGE];
        const { data, error } = await this.requireClient().from('listings').update({
            title: listing.title,
            description: listing.description,
            price: listing.price,
            is_free: listing.isFree,
            category_type: listing.category,
            sub_category: listing.subCategory,
            city: listing.city,
            neighborhood: listing.neighborhood || null,
            condition: listing.condition,
            images,
            attributes: listing.specs,
            updated_at: new Date().toISOString()
        }).eq('id', listingId).eq('user_id', authUser.id).select(LISTING_SELECT_COLUMNS).single();

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
        if (!authUser) throw new Error('يجب تسجيل الدخول لحذف الإعلان.');
        if (authUser.role === 'admin') {
            const { data, error } = await this.requireClient().rpc('delete_listing_as_admin', {
                p_listing_id: listingId
            });
            if (error) throw new Error(`تعذر حذف الإعلان: ${error.message}`);
            const deletedListing = Array.isArray(data) ? data[0] : data;
            if (!deletedListing) throw new Error('الإعلان غير موجود أو تعذر حذفه.');
            const imagePaths = (deletedListing.images || [])
                .map(url => this.storagePathFromUrl(url, deletedListing.owner_id))
                .filter(Boolean);
            if (imagePaths.length) {
                await this.requireClient().storage.from('listing-images').remove(imagePaths);
            }
            return this.getListings();
        }
        const listing = await this.getListingById(listingId);
        if (!listing) throw new Error('الإعلان غير موجود أو لا تملك صلاحية حذفه.');
        const { data: deleted, error } = await this.requireClient().from('listings')
            .delete()
            .eq('id', listingId)
            .select('id')
            .maybeSingle();
        if (error) throw new Error(`تعذر حذف الإعلان: ${error.message}`);
        if (!deleted) throw new Error('لم يُحذف الإعلان؛ تحقق من صلاحيات الحساب.');
        const imagePaths = (listing.images || [])
            .map(url => this.storagePathFromUrl(url, listing.userId))
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
        const { error } = await this.requireClient().rpc('set_listing_status', {
            p_listing_id: listingId,
            p_status: status
        });
        if (error) throw new Error(`تعذر تحديث حالة الإعلان: ${error.message}`);
    }

    async getAdminProfiles() {
        const authUser = await this.getAuthUser();
        if (!authUser || authUser.role !== 'admin') throw new Error('غير مصرح بقراءة بيانات الأعضاء.');
        const { data, error } = await this.requireClient().rpc('get_admin_profiles');
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

    async getAdminReports() {
        const authUser = await this.getAuthUser();
        if (!authUser || authUser.role !== 'admin') throw new Error('غير مصرح بقراءة البلاغات.');
        const { data, error } = await this.requireClient().from('reports')
            .select('id, listing_id, reporter_id, reason, status, created_at')
            .order('created_at', { ascending: false });
        if (error) throw new Error(`تعذر جلب البلاغات: ${error.message}`);
        const reports = data || [];
        const listingIds = [...new Set(reports.map(report => report.listing_id).filter(Boolean))];
        const reporterIds = [...new Set(reports.map(report => report.reporter_id))];
        const [{ data: listings }, { data: profiles }] = await Promise.all([
            listingIds.length
                ? this.requireClient().from('listings').select('id, title').in('id', listingIds)
                : Promise.resolve({ data: [] }),
            reporterIds.length
                ? this.requireClient().from('profiles').select('id, full_name').in('id', reporterIds)
                : Promise.resolve({ data: [] })
        ]);
        const listingMap = new Map((listings || []).map(item => [item.id, item.title]));
        const profileMap = new Map((profiles || []).map(item => [item.id, item.full_name]));
        return reports.map(report => ({
            id: report.id,
            listingId: report.listing_id,
            listingTitle: listingMap.get(report.listing_id) || 'إعلان غير متاح',
            reporterName: profileMap.get(report.reporter_id) || 'عضو',
            reason: report.reason,
            status: report.status,
            createdAt: report.created_at
        }));
    }

    async getAdminAccountDeletionRequests() {
        const { data, error } = await this.requireClient().rpc('get_admin_account_deletion_requests');
        if (error) throw new Error(`تعذر جلب طلبات حذف الحساب: ${error.message}`);
        return (data || []).map(request => ({
            id: request.id,
            userId: request.user_id,
            email: request.email || 'حساب محذوف',
            reason: request.reason || '',
            status: request.status,
            requestedAt: request.requested_at,
            reviewedAt: request.reviewed_at
        }));
    }

    async processAccountDeletionRequest(requestId) {
        const { data, error } = await this.requireClient().functions.invoke('process-account-deletion', {
            body: { request_id: requestId }
        });
        if (error || !data?.ok) throw new Error('تعذر تنفيذ حذف الحساب بأمان. لم تُحذف البيانات جزئيًا.');
        return this.getAdminAccountDeletionRequests();
    }

    async updateReportStatus(reportId, status) {
        const authUser = await this.getAuthUser();
        if (!authUser || authUser.role !== 'admin') throw new Error('غير مصرح بتحديث البلاغات.');
        if (!['reviewed', 'dismissed', 'resolved'].includes(status)) throw new Error('حالة البلاغ غير صالحة.');
        const { error } = await this.requireClient().from('reports')
            .update({ status })
            .eq('id', reportId);
        if (error) throw new Error(`تعذر تحديث البلاغ: ${error.message}`);
        return this.getAdminReports();
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
        const normalizedPhone = String(values.phone || '').trim().replace(/\s+/g, '');
        if (normalizedPhone && !/^(?:\+?966|0)?5\d{8}$/.test(normalizedPhone)) {
            throw new Error('أدخل رقم جوال سعودي صحيحًا أو اترك الحقل فارغًا.');
        }
        let uploadedAvatar = null;
        let avatarUrl = user.avatar;
        if (values.avatarFile) {
            const file = values.avatarFile;
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                throw new Error('صورة الحساب يجب أن تكون PNG أو JPG أو WEBP.');
            }
            if (file.size > 2 * 1024 * 1024) throw new Error('حجم صورة الحساب يجب ألا يتجاوز 2 ميجابايت.');
            const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[file.type];
            const path = `${user.id}/avatar-${Date.now()}.${extension}`;
            const { error: uploadError } = await this.requireClient().storage
                .from('profile-avatars')
                .upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
            if (uploadError) throw new Error(`تعذر رفع صورة الحساب: ${uploadError.message}`);
            const { data } = this.requireClient().storage.from('profile-avatars').getPublicUrl(path);
            uploadedAvatar = path;
            avatarUrl = data.publicUrl;
        }
        const { error } = await this.requireClient().from('profiles').update({
            full_name: values.name.trim(),
            phone_number: normalizedPhone || null,
            avatar_url: avatarUrl || null,
            updated_at: new Date().toISOString()
        }).eq('id', user.id);
        if (error) {
            if (uploadedAvatar) await this.requireClient().storage.from('profile-avatars').remove([uploadedAvatar]);
            throw new Error(`تعذر تحديث الملف الشخصي: ${error.message}`);
        }
        const previousAvatarPath = this.profileAvatarPathFromUrl(user.avatar, user.id);
        if (uploadedAvatar && previousAvatarPath) {
            await this.requireClient().storage.from('profile-avatars').remove([previousAvatarPath]);
        }
        return this.getAuthUser();
    }

    profileAvatarPathFromUrl(url, userId) {
        try {
            const marker = '/storage/v1/object/public/profile-avatars/';
            const pathname = new URL(url).pathname;
            if (!pathname.includes(marker)) return null;
            const path = decodeURIComponent(pathname.split(marker)[1]);
            return path.startsWith(`${userId}/`) ? path : null;
        } catch (_) {
            return null;
        }
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
                : this.requireClient().from('favorites').upsert(
                    { user_id: authUser.id, listing_id: id },
                    { onConflict: 'user_id,listing_id', ignoreDuplicates: true }
                );
            const { error } = await query;
            if (error) throw new Error(`تعذر تحديث المفضلة: ${error.message}`);
        }
        const next = isFavorite ? current.filter((value) => value !== id) : [...current, id];
        localStorage.setItem(this.FAVS_KEY, JSON.stringify(next));
        return next;
    }

}

const finnDB = new FinnSeniorProductionEngine();
