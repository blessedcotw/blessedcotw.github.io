-- ====================================================================
-- SKEMA DATABASE UTAMA SUPABASE UNTUK SONGREPO (GPdI COTW)
-- ====================================================================
-- Jalankan seluruh skrip ini di SQL Editor pada Supabase Dashboard.

-- --------------------------------------------------------------------
-- 1. TABEL `songs` (Perpustakaan Utama Lagu dari ProPresenter 7)
-- --------------------------------------------------------------------
-- HANYA BISA DI-MODIFY OLEH SKRIP PYTHON (service_role). WEB HANYA BACA (SELECT).
CREATE TABLE IF NOT EXISTS public.songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category TEXT DEFAULT 'lagu',
    content TEXT NOT NULL,
    filename TEXT UNIQUE NOT NULL,
    content_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS songs_title_idx ON public.songs (title);
CREATE INDEX IF NOT EXISTS songs_category_idx ON public.songs (category);

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

-- Reset Policy lama untuk tabel songs
DROP POLICY IF EXISTS "Allow public read access" ON public.songs;
DROP POLICY IF EXISTS "Allow service role write access" ON public.songs;
DROP POLICY IF EXISTS "Allow authenticated admin write access" ON public.songs;
DROP POLICY IF EXISTS "Allow write songs" ON public.songs;
DROP POLICY IF EXISTS "Allow public read songs" ON public.songs;
DROP POLICY IF EXISTS "Allow service role write songs" ON public.songs;

-- Kebijakan Tabel songs:
-- A. Publik & Web App HANYA BISA BACA (SELECT)
CREATE POLICY "Allow public read songs" ON public.songs
    FOR SELECT TO anon, authenticated USING (true);

-- B. Hanya Service Role (Skrip Python Pro7) yang BISA MODIFY (INSERT, UPDATE, DELETE)
CREATE POLICY "Allow service role write songs" ON public.songs
    FOR ALL TO service_role USING (true) WITH CHECK (true);


-- --------------------------------------------------------------------
-- 2. TABEL `user_songs` (Lagu Tambahan Hasil Input Manual / Edit dari Web)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category TEXT DEFAULT 'manual',
    content TEXT NOT NULL,
    filename TEXT UNIQUE NOT NULL,
    author TEXT DEFAULT 'Anonim',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_songs_title_idx ON public.user_songs (title);

ALTER TABLE public.user_songs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read user_songs" ON public.user_songs;
DROP POLICY IF EXISTS "Allow authenticated write user_songs" ON public.user_songs;
DROP POLICY IF EXISTS "Allow write user_songs" ON public.user_songs;
DROP POLICY IF EXISTS "Allow web write user_songs" ON public.user_songs;

-- Kebijakan Tabel user_songs: BISA BACA & BISA SIMPAN/EDIT DARI WEB
CREATE POLICY "Allow public read user_songs" ON public.user_songs
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow web write user_songs" ON public.user_songs
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- --------------------------------------------------------------------
-- 3. TABEL `songlists` (Daftar Pujian / Playlist Ibadah Tersimpan)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.songlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    event_date DATE,
    author TEXT DEFAULT 'Anonim',
    filename TEXT UNIQUE NOT NULL,
    cart_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS songlists_event_name_idx ON public.songlists (event_name);

ALTER TABLE public.songlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read songlists" ON public.songlists;
DROP POLICY IF EXISTS "Allow authenticated write songlists" ON public.songlists;
DROP POLICY IF EXISTS "Allow write songlists" ON public.songlists;
DROP POLICY IF EXISTS "Allow web write songlists" ON public.songlists;

-- Kebijakan Tabel songlists: BISA BACA & BISA SIMPAN/EDIT DARI WEB
CREATE POLICY "Allow public read songlists" ON public.songlists
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow web write songlists" ON public.songlists
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
