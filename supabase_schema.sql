-- =====================================================================
-- 🚀 SUPABASE POSTGRESQL SCHEMA FOR FINNMARKET (FINN.NO CLONE)
-- =====================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Create Enums
CREATE TYPE listing_category AS ENUM ('real_estate', 'vehicles', 'marketplace', 'jobs', 'freebies');
CREATE TYPE listing_status AS ENUM ('active', 'sold', 'reserved', 'expired');
CREATE TYPE item_condition AS ENUM ('new', 'like_new', 'good', 'fair', 'for_parts');

-- 3. Profiles Table (Extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    phone_number TEXT,
    city TEXT DEFAULT 'الرياض',
    verified_seller BOOLEAN DEFAULT FALSE,
    rating NUMERIC(2,1) DEFAULT 5.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT UNIQUE NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    icon TEXT NOT NULL,
    type listing_category NOT NULL,
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Listings Table
CREATE TABLE IF NOT EXISTS public.listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price NUMERIC(12,2) DEFAULT 0.00,
    is_free BOOLEAN DEFAULT FALSE,
    category_type listing_category NOT NULL,
    sub_category TEXT,
    condition item_condition DEFAULT 'good',
    city TEXT NOT NULL,
    neighborhood TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status listing_status DEFAULT 'active',
    views_count INT DEFAULT 0,
    favorites_count INT DEFAULT 0,
    
    -- Category-specific attributes stored as JSONB
    attributes JSONB DEFAULT '{}'::jsonb,
    
    fts tsvector GENERATED ALWAYS AS (
        to_tsvector('arabic', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(city, ''))
    ) STORED,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Listing Images Table
CREATE TABLE IF NOT EXISTS public.listing_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Favorites Table
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, listing_id)
);

-- 8. Messages & Chat Threads Table
CREATE TABLE IF NOT EXISTS public.chat_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_message TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 🔒 ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public listings are viewable by everyone" 
ON public.listings FOR SELECT USING (status = 'active');

CREATE POLICY "Users can create listings" 
ON public.listings FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own listings" 
ON public.listings FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================================
-- ⚡ INDEXES FOR ULTRA-FAST PERFORMANCE
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_listings_category ON public.listings(category_type);
CREATE INDEX IF NOT EXISTS idx_listings_city ON public.listings(city);
CREATE INDEX IF NOT EXISTS idx_listings_price ON public.listings(price);
CREATE INDEX IF NOT EXISTS idx_listings_fts ON public.listings USING gin(fts);
CREATE INDEX IF NOT EXISTS idx_listings_attributes ON public.listings USING gin(attributes);
