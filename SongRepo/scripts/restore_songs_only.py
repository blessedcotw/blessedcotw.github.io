#!/usr/bin/env python3
"""
Script khusus untuk inisialisasi (kosongkan) dan memulihkan HANYA tabel 'songs' 
dari file backup JSON ke Supabase.
"""
import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

# Set UTF-8 stdout encoding for Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

from sync_pro7_to_songrepo import (
    decrypt_service_role_key,
    DEFAULT_SUPABASE_URL,
    safe_urlopen
)

BACKUP_FILE_PATH = SCRIPT_DIR / "backups" / "backup_songrepo_2026-09-05_12-46-06.json"
DECRYPT_PWD = "GPdICOTW2026"

def main():
    print("=" * 70)
    print(" 🔄 INISIALISASI & RESTORE TABEL 'songs' SUPABASE")
    print("=" * 70)

    if not BACKUP_FILE_PATH.exists():
        print(f"❌ Error: File backup '{BACKUP_FILE_PATH}' tidak ditemukan.")
        sys.exit(1)

    print(f"📂 Membaca file backup: {BACKUP_FILE_PATH.name}")
    with open(BACKUP_FILE_PATH, "r", encoding="utf-8") as f:
        backup_data = json.load(f)

    songs_rows = backup_data.get("tables", {}).get("songs", [])
    print(f"📊 Ditemukan {len(songs_rows)} lagu untuk tabel 'songs'.")

    if not songs_rows:
        print("❌ Tidak ada data lagu di tabel 'songs'. Batal.")
        sys.exit(1)

    print("🔐 Mendapatkan Service Role Key...")
    service_key = decrypt_service_role_key(DECRYPT_PWD)
    supabase_url = os.getenv("SUPABASE_URL", DEFAULT_SUPABASE_URL)

    # 1. KOSONGKAN HANYA TABEL 'songs'
    print("\n🗑️ [1/2] Mengosongkan (Initialize) tabel 'songs'...")
    endpoint_delete = f"{supabase_url.rstrip('/')}/rest/v1/songs?id=not.is.null"
    headers_del = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}"
    }
    req_del = urllib.request.Request(endpoint_delete, headers=headers_del, method="DELETE")
    try:
        with safe_urlopen(req_del) as resp:
            print(f"   ✓ Tabel 'songs' berhasil dikosongkan (HTTP Status: {resp.status}).")
    except Exception as e:
        print(f"❌ Gagal mengosongkan tabel 'songs': {e}")
        sys.exit(1)

    # 2. RESTORE DATA LAGU KE TABEL 'songs'
    print(f"\n⚡ [2/2] Memulihkan {len(songs_rows)} lagu ke tabel 'songs'...")
    
    # Deduplicate by filename
    seen = {}
    deduped = []
    for r in songs_rows:
        fn = r.get("filename")
        if fn:
            seen[fn] = r
        else:
            deduped.append(r)
    if seen:
        deduped.extend(seen.values())
    songs_rows = deduped
    print(f"   ✓ Setelah deduping filename: {len(songs_rows)} lagu siap di-upsert.")

    endpoint_post = f"{supabase_url.rstrip('/')}/rest/v1/songs?on_conflict=filename"
    headers_post = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    chunk_size = 100
    success_count = 0
    total_chunks = -(-len(songs_rows) // chunk_size)

    for i in range(0, len(songs_rows), chunk_size):
        chunk = songs_rows[i:i + chunk_size]
        req_post = urllib.request.Request(
            endpoint_post, 
            data=json.dumps(chunk).encode("utf-8"), 
            headers=headers_post, 
            method="POST"
        )
        try:
            with safe_urlopen(req_post) as resp:
                if resp.status in (200, 201):
                    success_count += len(chunk)
                    print(f"   ✓ Batch {i // chunk_size + 1}/{total_chunks} ({len(chunk)} baris) berhasil di-upsert.")
        except Exception as e:
            print(f"   ❌ Error batch {i // chunk_size + 1}: {e}")

    print("\n" + "=" * 70)
    print(f" 🎉 SUKSES! Total {success_count}/{len(songs_rows)} lagu berhasil dipulihkan ke tabel 'songs'.")
    print("=" * 70)

if __name__ == "__main__":
    main()
