// Data Store & Initial Mock Listings for FinnMarket (Finn.no Clone)

const INITIAL_CATEGORIES = [
    { id: 'all', name: 'جميع القطاعات', icon: 'fa-globe', count: 18 },
    { id: 'real_estate', name: 'العقارات (Eiendom)', icon: 'fa-house-chimney', count: 4, badgeColor: '#0284c7' },
    { id: 'vehicles', name: 'السيارات (Bil)', icon: 'fa-car', count: 4, badgeColor: '#2563eb' },
    { id: 'marketplace', name: 'سوق المستعمل (Torget)', icon: 'fa-couch', count: 4, badgeColor: '#4f46e5' },
    { id: 'jobs', name: 'الوظائف (Jobb)', icon: 'fa-briefcase', count: 3, badgeColor: '#d97706' },
    { id: 'freebies', name: 'إهداء مجاني (Gis bort)', icon: 'fa-gift', count: 3, badgeColor: '#059669' }
];

const INITIAL_CITIES = ['جميع المدن', 'الرياض', 'جدة', 'الدمام', 'الخبر', 'مكة المكرمة', 'المدينة المنورة'];

const MOCK_LISTINGS = [
    {
        id: 'list-101',
        title: 'فيلا مودرن فاخرة مع مسبح وحديقة خاصة',
        category: 'real_estate',
        subCategory: 'فلل للبيع',
        price: 2450000,
        isFree: false,
        city: 'الرياض',
        neighborhood: 'حي حطين',
        condition: 'new',
        timeAgo: 'منذ ساعتين',
        views: 342,
        favoritesCount: 28,
        images: [
            'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80'
        ],
        seller: {
            name: 'شركة قمة العقارية',
            avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80',
            phone: '+966 50 123 4567',
            rating: 4.9,
            verified: true
        },
        specs: {
            'المساحة': '450 م²',
            'عدد الغرف': '6 غرف نوم',
            'الدورات': '5 حمامات',
            'عمر العقار': 'جديد (2026)',
            'الواجهة': 'شمالية 20م'
        },
        description: 'فيلا مودرن للبيع في أرقى أحياء الرياض، تصميم عصري هندسي متميز بمسطحات بناء واسعة، مسبح تدفئة، تكييف مخفي بالكامل، ضمانات شاملة على السباكة والكهرباء لمدة 15 سنة.'
    },
    {
        id: 'list-102',
        title: 'تويوتا كامري 2024 GLE بنزين - حالة الوكالة',
        category: 'vehicles',
        subCategory: 'سيارات سيدان',
        price: 98000,
        isFree: false,
        city: 'جدة',
        neighborhood: 'حي الشاطئ',
        condition: 'like_new',
        timeAgo: 'منذ 3 ساعات',
        views: 512,
        favoritesCount: 41,
        images: [
            'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80'
        ],
        seller: {
            name: 'فهد العتيبي',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
            phone: '+966 55 987 6543',
            rating: 4.8,
            verified: true
        },
        specs: {
            'سنة الصنع': '2024',
            'الممشى': '15,000 كم',
            'الناقل': 'أوتوماتيك',
            'الوقود': 'بنزين',
            'اللون': 'لؤلؤي أبيض'
        },
        description: 'سيارة تويوتا كامري فل كامل GLE خالية من الحوادث والصدمات، صيانة دورية بالوكالة، تظليل حراري وحماية واجهة متكاملة.'
    },
    {
        id: 'list-103',
        title: 'طقم كنب اسكندنافي فخم 8 أشخاص مع طاولة قهوة',
        category: 'marketplace',
        subCategory: 'أثاث وديكور',
        price: 2600,
        isFree: false,
        city: 'الرياض',
        neighborhood: 'حي السليمانية',
        condition: 'like_new',
        timeAgo: 'منذ 5 ساعات',
        views: 215,
        favoritesCount: 19,
        images: [
            'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=1200&q=80'
        ],
        seller: {
            name: 'سارة الشمالي',
            avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
            phone: '+966 54 321 0987',
            rating: 5.0,
            verified: false
        },
        specs: {
            'النوع': 'أثاث غرفة معيشة',
            'المادة': 'قماش مخمل + خشب زان',
            'اللون': 'رمادي فاتح (Arctic Blue)',
            'الحالة': 'استعمال نظيف جداً'
        },
        description: 'طقم كنب اسكندنافي مودرن بحالة ممتازة جداً بدون أي عيوب أو بقع، يشمل كنب ثلاثي + كنب ثنائي + 2 فوتيه وطاولة قهوة خشبية.'
    },
    {
        id: 'list-104',
        title: 'مهندس برمجيات واجهات أمامية (Senior Frontend Developer)',
        category: 'jobs',
        subCategory: 'تكنولوجيا ومعلومات',
        price: 16000,
        isFree: false,
        city: 'الرياض',
        neighborhood: 'المقر الرئيسي / هجين',
        condition: 'new',
        timeAgo: 'منذ يوم واحد',
        views: 890,
        favoritesCount: 63,
        images: [
            'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80'
        ],
        seller: {
            name: 'مجموعة الابتكار التقني',
            avatar: 'https://images.unsplash.com/photo-1572021335469-31706a17aaef?auto=format&fit=crop&w=200&q=80',
            phone: '+966 11 400 9000',
            rating: 4.9,
            verified: true
        },
        specs: {
            'طبيعة العمل': 'دوام كامل (Full-Time)',
            'الخبرة المطلوبة': '+4 سنوات',
            'التقنيات': 'React, Next.js, TypeScript, Tailwind',
            'الراتب': '14,000 - 18,000 ريال'
        },
        description: 'نبحث عن مهندس واجهات أمامية شغوف للانضمام لفريقنا في الرياض لتطوير المنصات الرقمية وتطبيقات الويب عالية الأداء.'
    },
    {
        id: 'list-105',
        title: 'مجاناً: مكتبة خشبية كبيرة بحالة ممتازة (Gis bort)',
        category: 'freebies',
        subCategory: 'أثاث وأجهزة',
        price: 0,
        isFree: true,
        city: 'الدمام',
        neighborhood: 'حي الشاطئ',
        condition: 'good',
        timeAgo: 'منذ ساعتين',
        views: 430,
        favoritesCount: 52,
        images: [
            'https://images.unsplash.com/photo-1594620302200-9a762244a156?auto=format&fit=crop&w=1200&q=80'
        ],
        seller: {
            name: 'عبدالله الدوسري',
            avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
            phone: '+966 56 111 2233',
            rating: 4.7,
            verified: true
        },
        specs: {
            'السعر': 'مجاناً 100%',
            'شرط الإهداء': 'التحميل والنقل على المستلم',
            'الأبعاد': '200سم * 120سم'
        },
        description: 'مكتبة خشبية متينة 5 أرفف للكتب والديكور، أهدها لمن يحتاجها مجاناً لوجه الله. النقل والاستلام المباشر من البيت بالدمام.'
    },
    {
        id: 'list-106',
        title: 'شقة مودرن للايجار 3 غرف وحوش خاص - حي الملقا',
        category: 'real_estate',
        subCategory: 'شقق للإيجار',
        price: 65000,
        isFree: false,
        city: 'الرياض',
        neighborhood: 'حي الملقا',
        condition: 'new',
        timeAgo: 'منذ 4 ساعات',
        views: 410,
        favoritesCount: 35,
        images: [
            'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80'
        ],
        seller: {
            name: 'مكتب الأصول العقارية',
            avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80',
            phone: '+966 50 888 7766',
            rating: 4.8,
            verified: true
        },
        specs: {
            'المساحة': '180 م²',
            'الغرف': '3 غرف نوم + صالة',
            'المطبخ': 'مراكب ومكيفات راكبة',
            'الإيجار': 'سنوي (دفعات)'
        },
        description: 'شقة فاخرة للإيجار بتشطيبات سوبر ديلوكس، دخول ذكي، حوش خاص وشترات على جميع النوافذ، موقف خاص بمظلة.'
    },
    {
        id: 'list-107',
        title: 'MacBook Pro M3 Max 16-inch - 36GB RAM - 1TB SSD',
        category: 'marketplace',
        subCategory: 'إلكترونيات وحواسيب',
        price: 11200,
        isFree: false,
        city: 'الخبر',
        neighborhood: 'حي الحزام الذهبي',
        condition: 'like_new',
        timeAgo: 'منذ 6 ساعات',
        views: 630,
        favoritesCount: 47,
        images: [
            'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1200&q=80'
        ],
        seller: {
            name: 'عمر باخشوين',
            avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
            phone: '+966 55 444 3322',
            rating: 5.0,
            verified: true
        },
        specs: {
            'المعالج': 'Apple M3 Max',
            'الذاكرة': '36GB Unified Memory',
            'التخزين': '1TB NVMe SSD',
            'الدورة': '24 دورة شحن فقط'
        },
        description: 'جهاز ماك بوك برو M3 ماكس بحالة الجديد تماماً، ضمان حاسبات العرب متبقي فيه 18 شهر، كرتونه وأغراضه الكاملة موجودة.'
    },
    {
        id: 'list-108',
        title: 'مجاناً: دراجة أطفال مقاس 16 بحالة ممتازة',
        category: 'freebies',
        subCategory: 'ألعاب وأطفال',
        price: 0,
        isFree: true,
        city: 'جدة',
        neighborhood: 'حي الروضة',
        condition: 'good',
        timeAgo: 'منذ 3 ساعات',
        views: 290,
        favoritesCount: 38,
        images: [
            'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80'
        ],
        seller: {
            name: 'أم جني',
            avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
            phone: '+966 53 777 8899',
            rating: 4.9,
            verified: false
        },
        specs: {
            'السعر': 'مجاني 100%',
            'العمر المناسب': '4 - 7 سنوات',
            'اللون': 'أحمر وأسود'
        },
        description: 'دراجة أطفال بحالة جيدة جداً، تحتاج فقط ضبط فرامل بسيط، جاهزة للاستلام الفوري بجدة.'
    }
];
