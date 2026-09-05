#!/usr/bin/env python3
"""
SongRepo Supabase Database Manager (Backup & Restore Unified Utility)
====================================================================
Script terpadu untuk melakukan Cadangan (Backup) dan Pemulihan (Restore)
seluruh data tabel 'songs', 'user_songs', dan 'songlists' di Supabase.

Penggunaan CLI:
  • Interaktif Menu : python scripts/db_manager.py
  • Langsung Backup : python scripts/db_manager.py --backup
  • Langsung Restore: python scripts/db_manager.py --restore [filepath]
"""

import os
import sys
import json
import getpass
import urllib.request
import urllib.error
import datetime
from pathlib import Path

# Set UTF-8 stdout encoding for Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

try:
    from sync_pro7_to_songrepo import (
        decrypt_service_role_key,
        get_service_role_key,
        DEFAULT_SUPABASE_URL,
        safe_urlopen
    )
except ImportError as e:
    print(f"❌ Error: Gagal mengimpor modul sync_pro7_to_songrepo.py: {e}")
    sys.exit(1)

def get_service_key(action_name: str = "PROSES DATABASE") -> str:
    """
    Mendapatkan Supabase Service Role Key melalui 3 metode keamanan:
    1. Langsung dari env var SUPABASE_SERVICE_ROLE_KEY (jika ada).
    2. Dekripsi dari env var SUPABASE_DECRYPT_PASSWORD via Fernet.
    3. Dekripsi interaktif dengan meminta Kata Sandi dari pengguna via CLI.
    """
    env_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if env_key:
        return env_key

    env_pwd = os.getenv("SUPABASE_DECRYPT_PASSWORD") or os.getenv("DECRYPT_PASSWORD")
    if env_pwd:
        try:
            return decrypt_service_role_key(env_pwd)
        except Exception as e:
            print(f"❌ Gagal mendeskripsi API key dengan kata sandi environment: {e}")
            sys.exit(1)

    if sys.stdin and sys.stdin.isatty():
        print(f"\n🔒 OTENTIKASI KEAMANAN ADMIN ({action_name})")
        pwd = getpass.getpass("🔑 Masukkan Kata Sandi Dekripsi API Key: ").strip()
        if not pwd:
            print("❌ Kata sandi tidak boleh kosong.")
            sys.exit(1)
        try:
            decrypted = decrypt_service_role_key(pwd)
            print("  ✅ Kata sandi terverifikasi valid & API Key terdekripsi.")
            return decrypted
        except Exception as e:
            print(f"❌ Kata sandi dekripsi salah atau gagal: {e}")
            sys.exit(1)
    else:
        print("❌ Gagal otentikasi: SUPABASE_SERVICE_ROLE_KEY atau SUPABASE_DECRYPT_PASSWORD belum diatur.")
        sys.exit(1)

def get_backup_dir() -> Path:
    b_dir = SCRIPT_DIR / "backups"
    b_dir.mkdir(exist_ok=True)
    return b_dir

def list_backup_files() -> list:
    b_dir = get_backup_dir()
    return sorted(list(b_dir.glob("backup_songrepo_*.json")), key=lambda p: p.stat().st_mtime, reverse=True)

# ============================= BACKUP LOGIC =============================
def fetch_table_data(url: str, service_key: str, table_name: str) -> list:
    print(f"  📥 Mengambil data dari tabel '{table_name}'...")
    all_rows = []
    step = 1000
    from_idx = 0
    has_more = True

    while has_more:
        endpoint = f"{url.rstrip('/')}/rest/v1/{table_name}?select=*"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Range": f"{from_idx}-{from_idx + step - 1}"
        }

        req = urllib.request.Request(endpoint, headers=headers, method="GET")
        try:
            with safe_urlopen(req) as resp:
                res_text = resp.read().decode("utf-8")
                rows = json.loads(res_text) if res_text else []
                if isinstance(rows, list) and len(rows) > 0:
                    all_rows.extend(rows)
                    if len(rows) < step:
                        has_more = False
                    else:
                        from_idx += step
                else:
                    has_more = False
        except Exception as e:
            print(f"  ❌ Error mengambil '{table_name}': {e}")
            break

    print(f"    ✓ Total {len(all_rows)} baris diperoleh dari '{table_name}'.")
    return all_rows

def do_backup():
    print("\n" + "=" * 70)
    print(" 💾 DISKROL BACKUP DATABASE SONGREPO (SUPABASE)")
    print("=" * 70)

    supabase_url = os.getenv("SUPABASE_URL", DEFAULT_SUPABASE_URL)
    service_key = get_service_key("BACKUP DATABASE")

    now = datetime.datetime.now()
    timestamp_str = now.strftime("%Y-%m-%d_%H-%M-%S")
    backup_filepath = get_backup_dir() / f"backup_songrepo_{timestamp_str}.json"

    print(f"🌐 Menghubungkan ke Supabase: {supabase_url}")
    print("🔄 Memulai proses pengunduhan snapshot database...\n")

    songs_data = fetch_table_data(supabase_url, service_key, "songs")
    user_songs_data = fetch_table_data(supabase_url, service_key, "user_songs")
    songlists_data = fetch_table_data(supabase_url, service_key, "songlists")

    backup_payload = {
        "metadata": {
            "created_at": now.isoformat(),
            "timestamp": timestamp_str,
            "supabase_url": supabase_url,
            "counts": {
                "songs": len(songs_data),
                "user_songs": len(user_songs_data),
                "songlists": len(songlists_data)
            }
        },
        "tables": {
            "songs": songs_data,
            "user_songs": user_songs_data,
            "songlists": songlists_data
        }
    }

    with open(backup_filepath, "w", encoding="utf-8") as f:
        json.dump(backup_payload, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 70)
    print(" 🎉 BACKUP DATABASE BERHASIL DISIMPAN!")
    print("=" * 70)
    print(f" 📂 Lokasi File Backup : {backup_filepath.resolve()}")
    print(f" 📊 Ringkasan Data:")
    print(f"    • Tabel 'songs'      : {len(songs_data)} lagu")
    print(f"    • Tabel 'user_songs' : {len(user_songs_data)} lagu")
    print(f"    • Tabel 'songlists'  : {len(songlists_data)} playlist")
    print(f" 📦 Ukuran Berkas     : {round(os.path.getsize(backup_filepath) / 1024, 2)} KB")
    print("=" * 70)
    return backup_filepath

# ============================= RESTORE LOGIC =============================
def clear_table(url: str, service_key: str, table_name: str) -> bool:
    print(f"  🗑️ Mengosongkan data lama pada tabel '{table_name}'...")
    endpoint = f"{url.rstrip('/')}/rest/v1/{table_name}?id=not.is.null"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}"
    }
    req = urllib.request.Request(endpoint, headers=headers, method="DELETE")
    try:
        with safe_urlopen(req) as resp:
            if resp.status in (200, 204):
                print(f"    ✓ Tabel '{table_name}' berhasil dikosongkan.")
                return True
    except Exception as e:
        print(f"  ❌ Gagal mengosongkan tabel '{table_name}': {e}")
        return False
    return False

def restore_table(url: str, service_key: str, table_name: str, rows: list) -> int:
    if not rows:
        print(f"  ℹ️ Tabel '{table_name}' kosong di file backup. Lewati.")
        return 0

    print(f"  ⚡ Memulihkan {len(rows)} baris data ke tabel '{table_name}'...")
    seen = {}
    deduped = []
    for r in rows:
        fn = r.get("filename")
        if fn:
            seen[fn] = r
        else:
            deduped.append(r)
    if seen:
        deduped.extend(seen.values())
    rows = deduped

    endpoint = f"{url.rstrip('/')}/rest/v1/{table_name}?on_conflict=filename"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    chunk_size = 100
    success_count = 0
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i:i + chunk_size]
        req = urllib.request.Request(endpoint, data=json.dumps(chunk).encode("utf-8"), headers=headers, method="POST")
        try:
            with safe_urlopen(req) as resp:
                if resp.status in (200, 201):
                    success_count += len(chunk)
                    print(f"    ✓ Batch {i // chunk_size + 1}/{-(-len(rows) // chunk_size)} ({len(chunk)} baris) berhasil di-upsert.")
        except Exception as e:
            print(f"    ❌ Error restore batch '{table_name}': {e}")

    print(f"  ✅ Selesai memulihkan {success_count}/{len(rows)} baris ke '{table_name}'.")
    return success_count

def do_restore(target_file_path=None, is_reset=False):
    print("\n" + "=" * 70)
    print(" 🔄 RESTORE DATABASE SONGREPO (SUPABASE)")
    print("=" * 70)

    backup_files = list_backup_files()

    if not target_file_path:
        if not backup_files:
            print("❌ Error: Tidak ada berkas backup JSON yang ditemukan di 'scripts/backups/'.")
            return
        
        print("📂 PILIH FILE BACKUP UNTUK DI-RESTORE:")
        for idx, bf in enumerate(backup_files, 1):
            file_time = datetime.datetime.fromtimestamp(bf.stat().st_mtime).strftime("%d-%m-%Y %H:%M:%S")
            print(f"   [{idx}] {bf.name} ({file_time})")
        print("   [C] Custom Path File")

        choice = input("\nPilihan Anda (1/2/... atau C, default: 1): ").strip().upper()
        if not choice or choice == "1":
            target_file_path = backup_files[0]
        elif choice == "C":
            c_path = input("Ketik path file backup JSON: ").strip()
            target_file_path = Path(c_path)
        elif choice.isdigit():
            i = int(choice) - 1
            if 0 <= i < len(backup_files):
                target_file_path = backup_files[i]

    if not target_file_path or not Path(target_file_path).exists():
        print(f"❌ Error: File backup '{target_file_path}' tidak ditemukan.")
        return

    target_file = Path(target_file_path)
    print(f"\n📂 Membaca Berkas Backup: {target_file.resolve()}")

    try:
        with open(target_file, "r", encoding="utf-8") as f:
            backup_data = json.load(f)
    except Exception as e:
        print(f"❌ Error membaca berkas JSON: {e}")
        return

    meta = backup_data.get("metadata", {})
    tables = backup_data.get("tables", {})

    songs_rows = tables.get("songs", [])
    user_songs_rows = tables.get("user_songs", [])
    songlists_rows = tables.get("songlists", [])

    print(f" ℹ️ Info Snapshot Backup:")
    print(f"    • Dibuat pada : {meta.get('created_at', 'N/A')}")
    print(f"    • Rincian Data: {len(songs_rows)} songs | {len(user_songs_rows)} user_songs | {len(songlists_rows)} songlists")

    if not is_reset:
        print("\n📋 PILIH MODE RESTORE:")
        print("   [1] Upsert / Merge Restore (Rekomendasi - Tambahkan/perbarui tanpa hapus data lain)")
        print("   [2] Reset & Full Restore (Kosongkan tabel terlebih dahulu, lalu timpa 100%)")
        
        mode_input = input("\nPilihan mode (1/2, default: 1): ").strip()
        is_reset = (mode_input == "2")

    if is_reset:
        print("\n" + "!" * 70)
        print(" 🚨 PERINGATAN: RESET & FULL RESTORE 🚨")
        print("!" * 70)
        confirm = input("⚠️ Ketik 'RESTORE' untuk mengosongkan dan menimpa database (atau ENTER untuk batal): ").strip()
        if confirm != "RESTORE":
            print("❌ Operasi restore dibatalkan.")
            return

    supabase_url = os.getenv("SUPABASE_URL", DEFAULT_SUPABASE_URL)
    service_key = get_service_key("RESTORE DATABASE")

    print(f"\n🌐 Menghubungkan ke Supabase: {supabase_url}")
    print("⚡ Memulai proses pemulihan data...\n")

    if is_reset:
        clear_table(supabase_url, service_key, "songs")
        clear_table(supabase_url, service_key, "user_songs")
        clear_table(supabase_url, service_key, "songlists")

    restored_songs = restore_table(supabase_url, service_key, "songs", songs_rows)
    restored_user_songs = restore_table(supabase_url, service_key, "user_songs", user_songs_rows)
    restored_songlists = restore_table(supabase_url, service_key, "songlists", songlists_rows)

    print("\n" + "=" * 70)
    print(" 🎉 PROSES RESTORE DATABASE SELESAI SUKSES!")
    print("=" * 70)
    print(f" 📊 Hasil Pemulihan:")
    print(f"    • Tabel 'songs'      : {restored_songs}/{len(songs_rows)} lagu dipulihkan")
    print(f"    • Tabel 'user_songs' : {restored_user_songs}/{len(user_songs_rows)} lagu dipulihkan")
    print(f"    • Tabel 'songlists'  : {restored_songlists}/{len(songlists_rows)} playlist dipulihkan")
    print("=" * 70)

# ============================= MAIN MENU =============================
def main():
    if "--backup" in sys.argv:
        do_backup()
        return

    if "--restore" in sys.argv:
        # Cari argumen path file setelah --restore jika ada
        idx = sys.argv.index("--restore")
        target = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else None
        do_restore(target_file_path=target)
        return

    print("=" * 70)
    print(" 🛠️ SONGREPO DATABASE MANAGER (BACKUP & RESTORE)")
    print("=" * 70)
    print(" 1. Backup Database (Ekspor snapshot database saat ini ke file JSON)")
    print(" 2. Restore Database (Pulihkan data dari file JSON ke Supabase)")
    print(" 3. Lihat Daftar File Backup Lokal")
    print(" 4. Keluar")

    choice = input("\nPilihan Anda (1/2/3/4, default: 1): ").strip()

    if choice == "2":
        do_restore()
    elif choice == "3":
        bfiles = list_backup_files()
        print(f"\n📂 Terdapat {len(bfiles)} file backup lokal di 'scripts/backups/':")
        for b in bfiles:
            file_time = datetime.datetime.fromtimestamp(b.stat().st_mtime).strftime("%d-%m-%Y %H:%M:%S")
            size_kb = round(b.stat().st_size / 1024, 2)
            print(f"   • {b.name} ({file_time}, {size_kb} KB)")
    elif choice == "4":
        print("👋 Keluar.")
    else:
        do_backup()

if __name__ == "__main__":
    main()
