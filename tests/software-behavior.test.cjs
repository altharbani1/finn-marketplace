const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-config.js'), 'utf8');
const context = {
    Blob,
    URL,
    crypto,
    fetch,
    console,
    INITIAL_CATEGORIES: [
        { id: 'all' },
        { id: 'marketplace' }
    ],
    INITIAL_CITIES: ['جميع المدن', 'الرياض'],
    MAX_LISTING_IMAGES: 15,
    MOCK_LISTINGS: [],
    localStorage: {
        getItem() { return null; },
        setItem() {},
        removeItem() {}
    },
    supabase: undefined
};
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.TestEngine = FinnSeniorProductionEngine;`, context);
const Engine = context.TestEngine;

function validListing(overrides = {}) {
    return {
        title: 'طاولة خشبية',
        description: 'طاولة بحالة ممتازة وجاهزة للاستخدام.',
        category: 'marketplace',
        subCategory: 'أثاث',
        city: 'الرياض',
        condition: 'good',
        price: 250,
        isFree: false,
        images: [],
        specs: {},
        ...overrides
    };
}

test('listing validation normalizes safe values and rejects invalid business data', () => {
    const engine = new Engine();
    const normalized = engine.validateListing(validListing({ title: '  طاولة خشبية  ' }));
    assert.equal(normalized.title, 'طاولة خشبية');
    assert.equal(normalized.price, 250);
    assert.throws(() => engine.validateListing(validListing({ price: -1 })), /سعر الإعلان/);
    assert.throws(() => engine.validateListing(validListing({ city: 'مدينة غير معتمدة' })), /مدينة الإعلان/);
    assert.throws(() => engine.validateListing(validListing({ title: 'س' })), /عنوان الإعلان/);
    assert.throws(() => engine.validateListing(validListing({ description: 'ؤؤؤؤؤؤؤؤؤؤؤؤؤؤ' })), /تكرار الحرف/);
    assert.throws(
        () => engine.validateListing(validListing({ images: Array(16).fill('https://example.com/image.jpg') })),
        /الحد الأقصى/
    );
});

test('getListingById requests only explicit columns and maps one row', async () => {
    let selectedColumns = null;
    let selectedId = null;
    const row = {
        id: 'listing-1', user_id: 'seller-1', title: 'إعلان', description: 'وصف كافٍ للإعلان',
        price: 10, is_free: false, category_type: 'marketplace', sub_category: 'أثاث',
        condition: 'good', city: 'الرياض', neighborhood: null, status: 'active', views_count: 0,
        attributes: {}, images: [], created_at: '2026-08-01T00:00:00Z'
    };
    const engine = new Engine();
    engine.requireClient = () => ({
        from: () => ({
            select(columns) {
                selectedColumns = columns;
                return this;
            },
            eq(_column, id) {
                selectedId = id;
                return this;
            },
            async maybeSingle() { return { data: row, error: null }; }
        })
    });

    const listing = await engine.getListingById('listing-1');
    assert.equal(selectedId, 'listing-1');
    assert.notEqual(selectedColumns, '*');
    assert.match(selectedColumns, /id,user_id,title/);
    assert.equal(listing.id, 'listing-1');
});

test('legacy Scandinavian category labels are localized when reading old rows', () => {
    const engine = new Engine();
    const base = {
        id: 'listing-legacy', user_id: 'seller-1', title: 'كامري', description: 'سيارة مستعملة بحالة جيدة',
        price: 10, is_free: false, category_type: 'vehicles', condition: 'good', city: 'الرياض',
        status: 'active', images: [], created_at: '2026-08-01T00:00:00Z'
    };
    assert.equal(engine.mapListing({ ...base, sub_category: 'السيارات (Bil)' }).subCategory, 'السيارات');
    assert.equal(engine.mapListing({ ...base, sub_category: 'Gis bort' }).subCategory, 'إهداء مجاني');
});

test('privileged reads and mutations use the agreed RPC contracts', async () => {
    const calls = [];
    const engine = new Engine();
    engine.getAuthUser = async () => ({ id: 'admin-1', role: 'admin' });
    engine.requireClient = () => ({
        async rpc(name, args) {
            calls.push({ name, args });
            if (name === 'get_listing_contact') {
                return { data: [{ id: 'seller-1', full_name: 'معلن', phone_number: '0500000000' }], error: null };
            }
            if (name === 'get_admin_profiles') return { data: [], error: null };
            return { data: null, error: null };
        }
    });

    await engine.getListingSeller('listing-1');
    await engine.getAdminProfiles();
    await engine.updateListingStatus('listing-1', 'rejected');

    assert.deepEqual(calls.map(call => call.name), [
        'get_listing_contact',
        'get_admin_profiles',
        'set_listing_status'
    ]);
    assert.equal(calls[0].args.p_listing_id, 'listing-1');
    assert.equal(calls[2].args.p_status, 'rejected');
});

test('seller rating update is one atomic RPC call', async () => {
    const calls = [];
    const engine = new Engine();
    engine.getAuthUser = async () => ({ id: 'reviewer-1' });
    engine.getSellerRating = async () => ({ average: 4, count: 1 });
    engine.requireClient = () => ({
        async rpc(name, args) {
            calls.push({ name, args });
            return { error: null };
        }
    });

    await engine.rateSeller('listing-1', 'seller-1', 4);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'upsert_seller_rating');
    assert.equal(calls[0].args.p_listing_id, 'listing-1');
    assert.equal(calls[0].args.p_seller_id, 'seller-1');
    assert.equal(calls[0].args.p_rating, 4);
});

test('new comments never send a client-controlled seller flag', async () => {
    let inserted = null;
    const engine = new Engine();
    engine.getAuthUser = async () => ({ id: 'user-1' });
    engine.getListingComments = async () => [];
    engine.requireClient = () => ({
        from: () => ({
            async insert(payload) {
                inserted = payload;
                return { error: null };
            }
        })
    });

    await engine.addComment('listing-1', 'هل المنتج متاح؟', 'spoofed-owner-id');
    assert.equal(inserted.user_id, 'user-1');
    assert.equal(Object.hasOwn(inserted, 'is_seller_reply'), false);
});

test('listing upload accepts Blob directly without converting it through fetch', async () => {
    let uploadedBody = null;
    const engine = new Engine();
    engine.requireClient = () => ({
        storage: {
            from: () => ({
                async upload(_path, body) {
                    uploadedBody = body;
                    return { error: null };
                },
                getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.example/image.jpg' } }),
                async remove() { return { error: null }; }
            })
        }
    });
    const image = new Blob(['image'], { type: 'image/jpeg' });

    const result = await engine.uploadListingImages('listing-1', [image], 'user-1');
    assert.equal(uploadedBody, image);
    assert.equal(result.urls.length, 1);
    assert.equal(result.urls[0], 'https://cdn.example/image.jpg');
});
