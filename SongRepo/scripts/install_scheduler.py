#!/usr/bin/env python3
"""
One-Click Interactive Scheduler Installer (macOS launchd & Windows Task Scheduler)
====================================================================================
Script installer interaktif untuk mendaftarkan jadwal otomatis sinkronisasi ProPresenter 7
ke macOS launchd (Daemon/Agent) atau Windows Task Scheduler.
"""

import os
import sys
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

try:
    from sync_pro7_to_songrepo import get_default_pro7_library_path
except ImportError:
    def get_default_pro7_library_path():
        return Path.home() / "Documents" / "ProPresenter" / "Libraries"

def print_header():
    print("=" * 70)
    print(" 🚀 INSTALLER OTOMASI SCHEDULER PROPRESENTER 7 -> SONGREPO")
    print("=" * 70)

def prompt_schedule_interval():
    print("\n⏰ PILIH INTERVAL SINKRONISASI OTOMATIS:")
    print("   [1] Setiap 1 Jam (Rekomendasi - Default)")
    print("   [2] Setiap 3 Jam")
    print("   [3] Setiap 6 Jam")
    print("   [4] Setiap Hari pukul 08.00 pagi")
    
    choice = input("\nPilihan interval (1/2/3/4, default: 1): ").strip()
    if choice == "2":
        return {"type": "hourly", "value": 3, "seconds": 10800}
    elif choice == "3":
        return {"type": "hourly", "value": 6, "seconds": 21600}
    elif choice == "4":
        return {"type": "daily", "value": 1, "seconds": 86400, "hour": 8, "minute": 0}
    else:
        return {"type": "hourly", "value": 1, "seconds": 3600}

def prompt_library_path():
    default_path = get_default_pro7_library_path()
    print("\n📚 PILIH FOLDER LIBRARY PROPRESENTER 7:")
    print(f" Default: {default_path}")
    
    sub_dirs = []
    if default_path.exists():
        sub_dirs = [d for d in default_path.iterdir() if d.is_dir() and not d.name.startswith(".")]

    if sub_dirs:
        print(" Sub-folder terdeteksi:")
        print("   [A] Semua Library (Default)")
        for idx, sub in enumerate(sub_dirs, 1):
            print(f"   [{idx}] {sub.name}")
        
        choice = input("\nPilih library (A/1/2/..., default: A): ").strip().upper()
        if choice and choice != "A":
            if choice.isdigit() and 1 <= int(choice) <= len(sub_dirs):
                return sub_dirs[int(choice) - 1]
    
    custom = input("\nTekan ENTER untuk menggunakan default, atau ketik path lain: ").strip()
    if custom:
        p = Path(custom)
        if p.exists():
            return p
    return default_path

import shutil
import getpass

def deploy_scheduler_to_documents() -> Path:
    install_dir = Path.home() / "Documents" / "SongRepoScheduler"
    install_dir.mkdir(parents=True, exist_ok=True)
    
    if SCRIPT_DIR.resolve() == install_dir.resolve():
        print(f"\nℹ️ Script sudah berjalan langsung dari folder target: {install_dir}")
        return install_dir

    print(f"\n📂 Menyalin seluruh paket script dan modul ke lokasi aman: {install_dir}")
    
    scripts_to_copy = [
        "install_scheduler.py",
        "sync_scheduler.py",
        "sync_pro7_to_songrepo.py",
        "db_manager.py"
    ]
    for s_name in scripts_to_copy:
        src = SCRIPT_DIR / s_name
        dst = install_dir / s_name
        if src.exists():
            shutil.copy2(src, dst)
            print(f"  ✓ Berkas '{s_name}' berhasil disalin.")

    # Copy pb_out directory if exists
    pb_out_src = SCRIPT_DIR / "pb_out"
    if not pb_out_src.exists():
        pb_out_src = SCRIPT_DIR.parent / "pb_out"
    if not pb_out_src.exists():
        pb_out_src = SCRIPT_DIR.parent.parent / "ProPresenter Decoder v3" / "pb_out"

    if pb_out_src.exists():
        pb_out_dst = install_dir / "pb_out"
        if pb_out_dst.exists():
            shutil.rmtree(pb_out_dst)
        shutil.copytree(pb_out_src, pb_out_dst)
        print(f"  ✓ Modul Protobuf 'pb_out' berhasil disalin.")
        
    return install_dir

def install_macos_launchd(python_bin, scheduler_script, lib_path, schedule_config, env_var_name=None, env_var_value=None):
    label = "com.gpdicotw.songrepo.sync"
    plist_path = Path.home() / "Library" / "LaunchAgents" / f"{label}.plist"
    plist_path.parent.mkdir(parents=True, exist_ok=True)

    target_dir = scheduler_script.parent
    log_file = target_dir / "sync_scheduler.log"

    interval_xml = ""
    if schedule_config["type"] == "hourly":
        interval_xml = f"""    <key>StartInterval</key>
    <integer>{schedule_config['seconds']}</integer>"""
    else:
        interval_xml = f"""    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>{schedule_config['hour']}</integer>
        <key>Minute</key>
        <integer>{schedule_config['minute']}</integer>
    </dict>"""

    env_xml = ""
    if env_var_name and env_var_value:
        env_xml = f"""    <key>EnvironmentVariables</key>
    <dict>
        <key>{env_var_name}</key>
        <string>{env_var_value}</string>
    </dict>"""

    plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>
{env_xml}
    <key>ProgramArguments</key>
    <array>
        <string>{python_bin}</string>
        <string>{scheduler_script}</string>
        <string>{lib_path}</string>
    </array>
{interval_xml}
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>{log_file}</string>
    <key>StandardErrorPath</key>
    <string>{log_file}</string>
</dict>
</plist>
"""

    with open(plist_path, "w", encoding="utf-8") as f:
        f.write(plist_content)

    # Kunci permission plist karena berisi kredensial (password/key) plaintext
    os.chmod(plist_path, 0o600)

    print(f"\n📝 File LaunchAgent berhasil dibuat: {plist_path}")

    # Gunakan bootstrap/bootout (API modern) — load/unload deprecated & sering silent-fail
    # pada LaunchAgent per-user di macOS Ventura ke atas, termasuk Tahoe.
    uid = os.getuid()
    domain = f"gui/{uid}"
    service_target = f"{domain}/{label}"

    subprocess.run(["launchctl", "bootout", domain, str(plist_path)], stderr=subprocess.DEVNULL)
    res = subprocess.run(["launchctl", "bootstrap", domain, str(plist_path)], capture_output=True, text=True)

    if res.returncode == 0:
        subprocess.run(["launchctl", "enable", service_target], capture_output=True, text=True)
        print("✅ SUCCESS: launchd macOS agent berhasil didaftarkan & diaktifkan!")
        print("🚀 Memulai eksekusi perdana scheduler di latar belakang...")
        kick_res = subprocess.run(["launchctl", "kickstart", "-k", service_target], capture_output=True, text=True)
        if kick_res.returncode != 0:
            subprocess.run(["launchctl", "start", label], capture_output=True, text=True)
        print("  ✓ Scheduler otomatis dipicu untuk berjalan sekarang.")
    else:
        print(f"⚠️ Peringatan launchctl: {res.stderr.strip()}")
        print(f" JALANKAN MANUAL: launchctl bootstrap {domain} '{plist_path}'")

def install_windows_task_scheduler(python_bin, scheduler_script, lib_path, schedule_config, env_var_name=None, env_var_value=None):
    task_name = "SongRepoPro7Sync"
    target_dir = scheduler_script.parent
    bat_path = target_dir / "run_sync_task.bat"

    set_env_line = f'set "{env_var_name}={env_var_value}"\n' if (env_var_name and env_var_value) else ''
    bat_content = f"""@echo off
{set_env_line}"{python_bin}" "{scheduler_script}" "{lib_path}"
"""
    with open(bat_path, "w", encoding="utf-8") as f:
        f.write(bat_content)

    print(f"\n📝 File batch runner scheduler berhasil dibuat di lokasi aman: {bat_path}")

    # Command string points directly to the batch runner file in Documents
    action_str = f'"{bat_path.resolve()}"'

    if schedule_config["type"] == "hourly":
        schedule_arg = "HOURLY"
        modifier_arg = str(schedule_config["value"])
    else:
        schedule_arg = "DAILY"
        modifier_arg = "1"

    cmd = [
        "schtasks", "/Create",
        "/TN", task_name,
        "/TR", action_str,
        "/SC", schedule_arg,
        "/MO", modifier_arg,
        "/F"
    ]

    print(f"\n⚙️ Mengatur Windows Task Scheduler ({task_name})...")
    res = subprocess.run(cmd, capture_output=True, text=True)

    if res.returncode == 0:
        print(f"✅ SUCCESS: Windows Task Scheduler '{task_name}' berhasil didaftarkan!")
        print("🚀 Memulai eksekusi perdana scheduler di latar belakang...")
        run_res = subprocess.run(["schtasks", "/Run", "/TN", task_name], capture_output=True, text=True)
        if run_res.returncode == 0:
            print("  ✓ Task Scheduler berhasil dipicu untuk berjalan sekarang.")
        else:
            print(f"  ⚠️ Gagal memicu Task Scheduler secara otomatis: {run_res.stderr.strip()}")
    else:
        print(f"❌ Error schtasks: {res.stderr.strip()}")
        print(" 💡 Pastikan Anda menjalankan terminal dengan hak akses Administrator jika diperlukan.")

def main():
    print_header()

    python_bin = sys.executable
    source_scheduler_script = SCRIPT_DIR / "sync_scheduler.py"

    if not source_scheduler_script.exists():
        print(f"❌ Error: Script '{source_scheduler_script}' tidak ditemukan!")
        sys.exit(1)

    lib_path = prompt_library_path()
    schedule_config = prompt_schedule_interval()

    print("\n" + "=" * 70)
    print(" 🔑 OTENTIKASI API KEY UNTUK SCHEDULER")
    print("=" * 70)

    # env_var_name/env_var_value menentukan variabel apa yang akan ditulis ke
    # plist (macOS) / .bat (Windows), sesuai apa yang benar-benar tersedia:
    # - SUPABASE_SERVICE_ROLE_KEY: key plaintext, langsung dipakai scheduler
    # - SUPABASE_DECRYPT_PASSWORD: password, di-decrypt ulang oleh scheduler tiap run
    env_var_name = None
    env_var_value = None

    env_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    env_pwd = os.getenv("SUPABASE_DECRYPT_PASSWORD") or os.getenv("DECRYPT_PASSWORD")

    if env_key:
        print(" ℹ️ Terdeteksi SUPABASE_SERVICE_ROLE_KEY di Environment Variable sistem.")
        env_var_name, env_var_value = "SUPABASE_SERVICE_ROLE_KEY", env_key
    elif env_pwd:
        print(" ℹ️ Terdeteksi password dekripsi di Environment Variable sistem, memverifikasi...")
        try:
            from sync_pro7_to_songrepo import decrypt_service_role_key
            decrypt_service_role_key(env_pwd)
            print("  ✅ Password valid.")
            env_var_name, env_var_value = "SUPABASE_DECRYPT_PASSWORD", env_pwd
        except Exception as e:
            print(f"❌ Password di Environment Variable tidak valid: {e}")
            print(" Operasi installer dibatalkan.")
            sys.exit(1)
    else:
        pwd_input = getpass.getpass("🔑 Masukkan Kata Sandi Dekripsi API Key untuk diset di task scheduler: ").strip()
        if pwd_input:
            try:
                from sync_pro7_to_songrepo import decrypt_service_role_key
                decrypt_service_role_key(pwd_input)
                print("  ✅ Kata sandi terverifikasi valid!")
                env_var_name, env_var_value = "SUPABASE_DECRYPT_PASSWORD", pwd_input
            except Exception as e:
                print(f"❌ Kata sandi dekripsi salah atau gagal: {e}")
                print(" Operasi installer dibatalkan.")
                sys.exit(1)

    # Disalin ke folder Documents/SongRepoScheduler agar aman dan independen dari git working directory
    install_dir = deploy_scheduler_to_documents()
    target_scheduler_script = install_dir / "sync_scheduler.py"

    print("\n" + "=" * 70)
    print(" 📋 RINGKASAN KONFIGURASI PENDAFTARAN:")
    print(f" • Sistem Operasi : {sys.platform.upper()}")
    print(f" • Executable Python: {python_bin}")
    print(f" • Folder Terpasang: {install_dir}")
    print(f" • Script Target  : {target_scheduler_script}")
    print(f" • Folder Library : {lib_path}")
    print(f" • Jadwal Sync    : {schedule_config['type']} (interval {schedule_config['value']})")
    print(f" • Variabel Env   : {env_var_name or '(tidak diset)'}")
    print("=" * 70)

    confirm = input("\nKonfirmasi pendaftaran (ketik 'YA' untuk melanjutkan): ").strip().upper()
    if confirm != "YA":
        print("❌ Pembatalan installer.")
        return

    if sys.platform == "darwin":
        install_macos_launchd(python_bin, target_scheduler_script, lib_path, schedule_config, env_var_name, env_var_value)
    elif sys.platform == "win32":
        install_windows_task_scheduler(python_bin, target_scheduler_script, lib_path, schedule_config, env_var_name, env_var_value)
    else:
        print(f"ℹ️ Platform '{sys.platform}' dapat menggunakan cronjob berikut:")
        prefix = f"{env_var_name}='{env_var_value}' " if env_var_name else ""
        cron_expr = f"0 */{schedule_config['value']} * * * {prefix}{python_bin} {target_scheduler_script} {lib_path}"
        print(f"\n  {cron_expr}")

    print("\n🎉 Proses installer selesai!")

if __name__ == "__main__":
    main()
