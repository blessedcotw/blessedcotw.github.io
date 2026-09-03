#!/usr/bin/env python3
"""
Sync ProPresenter 7 Songs to SongRepo Cloud Database (blessedcotw/SongRepo_userdata)
=====================================================================================
Script otomatis menggunakan engine resmi ProPresenter Decoder v3 (Protobuf)
untuk memindai, mengurai lirik, chord [CHORD], dan catatan [NOTES] dari file .pro ProPresenter 7,
mengecek duplikat/perubahan via SHA-256 hash, dan mengunggah secara otomatis via Worker (Cara A).
"""

import os
import sys
import re
import json
import base64
import hashlib
import glob
import datetime
import urllib.request
import urllib.error
import getpass
from pathlib import Path

# Impor protobuf bindings resmi ProPresenter Decoder v3
PB_OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "ProPresenter Decoder v3", "pb_out"))
if os.path.exists(PB_OUT_DIR):
    sys.path.insert(0, PB_OUT_DIR)

try:
    import presentation_pb2
except ImportError:
    print(f"❌ Error: Tidak dapat menemukan modul Protobuf di '{PB_OUT_DIR}'.")
    sys.exit(1)

# ============================= KONFIGURASI =============================
WORKER_BASE_URL = "https://songrepo-userdata.mm-cotw.workers.dev"
REPO_NAME = "blessedcotw/SongRepo_userdata"
BRANCH_NAME = "main"

def get_default_pro7_library_path():
    user_home = Path.home()
    win_path = user_home / "Documents" / "ProPresenter" / "Libraries"
    mac_path = user_home / "Documents" / "ProPresenter" / "Libraries"
    if win_path.exists():
        return win_path
    elif mac_path.exists():
        return mac_path
    return win_path

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def compute_content_hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()

def sanitize_filename(title: str) -> str:
    clean_title = re.sub(r'[^a-zA-Z0-9]+', '_', title.strip().lower()).strip('_')
    return f"lagu_{clean_title}.txt"

# ============================= RTF & PROTOBUF DECODER ENGINE (v3) =============================
def decode_rtf_escapes(value):
    def repl_u(m):
        code = int(m.group(1))
        normalized = code + 65536 if code < 0 else code
        return chr(normalized)

    value = re.sub(r'\\u(-?\d+)\s?\?', repl_u, value)

    def repl_hex(m):
        byte_val = int(m.group(1), 16)
        return bytes([byte_val]).decode("windows-1252", errors="replace")

    value = re.sub(r"\\'([0-9a-fA-F]{2})", repl_hex, value)
    value = value.replace("\\{", "{").replace("\\}", "}").replace("\\\\", "\\")
    return value

_RTF_DESTINATION_GROUPS = re.compile(r'\{\\(?:fonttbl|colortbl|\*\\[a-zA-Z]+)[^{}]*\}')

def rtf_to_text(rtf_bytes):
    if not rtf_bytes:
        return ""
    rtf = rtf_bytes.decode("windows-1252", errors="replace")
    rtf = _RTF_DESTINATION_GROUPS.sub('', rtf)
    rtf = re.sub(r'\\\r?\n', '\n', rtf)
    rtf = re.sub(r'\\par\b ?', '\n', rtf)
    rtf = re.sub(r'\\line\b ?', '\n', rtf)
    rtf = decode_rtf_escapes(rtf)
    rtf = re.sub(r'\\[a-zA-Z]+-?\d* ?', '', rtf)
    rtf = rtf.replace('\\*', '')
    rtf = rtf.replace('{', '').replace('}', '')
    lines = [ln.strip() for ln in rtf.split('\n')]
    lines = [ln for ln in lines if ln]
    return "\n".join(lines)

CHORD_LINE_TAG = "[CHORD]"

def build_chord_line(line, local_chords):
    max_end = len(line)
    for pos, name in local_chords:
        max_end = max(max_end, pos + len(name))
    chars = list(" " * max_end)
    for pos, name in local_chords:
        for offset, ch in enumerate(name):
            if pos + offset < len(chars):
                chars[pos + offset] = ch
    return CHORD_LINE_TAG + "".join(chars).rstrip()

def insert_chords_into_text(text, chords):
    if not chords:
        return text
    lines = text.split("\n")
    out_lines = []
    cursor = 0
    chords_sorted = sorted(chords, key=lambda c: c[0])
    ci = 0
    for line in lines:
        line_len = len(line)
        line_start = cursor
        line_end = cursor + line_len
        local_chords = []
        while ci < len(chords_sorted) and chords_sorted[ci][0] < line_end:
            start_char, end_char, name = chords_sorted[ci]
            local_pos = start_char - line_start
            if 0 <= local_pos <= line_len:
                local_chords.append((local_pos, name))
            ci += 1
        if local_chords:
            out_lines.append(build_chord_line(line, local_chords))
        out_lines.append(line)
        cursor = line_end
    return "\n".join(out_lines)

def extract_slide_text(presentation_slide):
    base_slide = presentation_slide.base_slide
    plain = ""
    if base_slide.elements:
        el = base_slide.elements[0].element
        txt_field = el.text
        rtf = txt_field.rtf_data
        if rtf:
            plain = rtf_to_text(rtf)
            if plain:
                chords = []
                for ca in txt_field.attributes.custom_attributes:
                    if ca.WhichOneof("Attribute") == "chord":
                        chords.append((ca.range.start, ca.range.end, ca.chord))
                plain = insert_chords_into_text(plain, chords)

    notes_rtf = presentation_slide.notes.rtf_data
    notes_text = rtf_to_text(notes_rtf) if notes_rtf else ""

    if notes_text:
        tagged_notes = "\n".join(f"[NOTES]{ln}" for ln in notes_text.split("\n"))
        return f"{plain}\n{tagged_notes}" if plain else tagged_notes
    return plain

def number_repeated_sections(sections):
    totals = {}
    for label, _ in sections:
        totals[label] = totals.get(label, 0) + 1
    seen = {}
    out = []
    for label, text in sections:
        if totals[label] == 1:
            out.append((label, text))
        else:
            seen[label] = seen.get(label, 0) + 1
            out.append((f"{label} {seen[label]}", text))
    return out

def decode_pro7_file(file_path):
    try:
        with open(file_path, "rb") as f:
            data = f.read()

        pres = presentation_pb2.Presentation()
        pres.ParseFromString(data)

        title = pres.name or os.path.splitext(os.path.basename(file_path))[0]

        cue_text_by_uuid = {}
        for cue in pres.cues:
            cue_uuid = cue.uuid.string
            texts = []
            for act in cue.actions:
                if act.slide.HasField("presentation"):
                    texts.append(extract_slide_text(act.slide.presentation))
            combined = "\n".join(t for t in texts if t)
            if combined:
                cue_text_by_uuid[cue_uuid] = combined

        sections = []
        used_uuids = set()

        if pres.cue_groups:
            for cg in pres.cue_groups:
                label = cg.group.name or "Unsectioned"
                slide_texts = []
                for cid in cg.cue_identifiers:
                    u = cid.string
                    if u in cue_text_by_uuid:
                        slide_texts.append(cue_text_by_uuid[u])
                        used_uuids.add(u)
                if slide_texts:
                    sections.append((label, "\n\n".join(slide_texts)))

        leftover = [cue_text_by_uuid[cue.uuid.string]
                    for cue in pres.cues
                    if cue.uuid.string in cue_text_by_uuid and cue.uuid.string not in used_uuids]
        if leftover:
            sections.append(("Unsectioned", "\n\n".join(leftover)))

        if not sections:
            return None

        sections = number_repeated_sections(sections)

        parts = [f"title: {title}", ""]
        if pres.notes:
            parts.append("[NOTES]")
            parts.append("")
            parts.append(pres.notes)
            parts.append("")
        for label, text in sections:
            parts.append(f"[{label.upper()}]")
            parts.append("")
            parts.append(text)
            parts.append("")

        full_text = "\n".join(parts).rstrip() + "\n"
        return {
            "title": title,
            "filename": sanitize_filename(title),
            "text": full_text
        }
    except Exception as e:
        print(f"  ❌ Gagal mengurai {os.path.basename(file_path)}: {e}")
        return None

# ============================= HTTP / WORKER API =============================
def http_request(url: str, method: str = "GET", headers: dict = None, body_data: dict = None):
    if headers is None:
        headers = {}
    
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    
    req_body = None
    if body_data is not None:
        req_body = json.dumps(body_data).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_text = response.read().decode("utf-8")
            return response.status, json.loads(res_text) if res_text else {}
    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_text)
        except Exception:
            err_json = {"error": err_text}
        return e.code, err_json

# ============================= UNDO / ROLLBACK LOGIC =============================
def undo_sync():
    print("=" * 70)
    print(" ↩️ UNDO / BERSIHKAN LAGU HASIL SINKRONISASI SCRIPT")
    print("=" * 70)

    admin_pwd = getpass.getpass("\n🔒 Masukkan Kata Sandi Admin Worker SongRepo: ").strip()
    if not admin_pwd:
        print("❌ Kata sandi tidak boleh kosong.")
        return

    admin_hash = hash_password(admin_pwd)
    headers_write = {
        "Content-Type": "application/json",
        "X-Admin-Hash": admin_hash
    }

    print("\n🌐 Mengambil manifest cloud dari GitHub via Worker...")
    manifest_url = f"{WORKER_BASE_URL}/github/repos/{REPO_NAME}/contents/library/library-manifest.json?ref={BRANCH_NAME}"
    status, manifest_res = http_request(manifest_url)

    if status != 200:
        print("❌ Manifest cloud tidak ditemukan atau gagal dimuat.")
        return

    manifest_sha = manifest_res.get("sha")
    content_b64 = manifest_res.get("content", "")
    raw_json = base64.b64decode(content_b64).decode("utf-8")
    filenames = json.loads(raw_json)

    print(f"\nTotal file di Cloud manifest: {len(filenames)} file.")
    confirm = input("⚠️ Apakah Anda yakin ingin MENGHAPUS SEMUA lagu hasil sync dari Cloud? (ketik 'YA' untuk konfirmasi): ").strip()
    if confirm != "YA":
        print("❌ Pembatalan. Tidak ada file yang dihapus.")
        return

    deleted_count = 0
    remaining_manifest = []

    for fname in filenames:
        del_url = f"{WORKER_BASE_URL}/github/repos/{REPO_NAME}/contents/library/{fname}?ref={BRANCH_NAME}"
        file_status, file_res = http_request(del_url)
        if file_status == 200:
            file_sha = file_res.get("sha")
            delete_payload = {
                "message": f"Undo sync: Delete {fname}",
                "sha": file_sha,
                "branch": BRANCH_NAME
            }
            del_put_url = f"{WORKER_BASE_URL}/github/repos/{REPO_NAME}/contents/library/{fname}"
            d_status, d_res = http_request(del_put_url, method="DELETE", headers=headers_write, body_data=delete_payload)
            if d_status in (200, 201):
                print(f"  🗑️ Terhapus: {fname}")
                deleted_count += 1
            else:
                print(f"  ❌ Gagal menghapus {fname}: {d_res.get('error', d_status)}")
                remaining_manifest.append(fname)
        else:
            print(f"  ⚠️ File {fname} tidak ditemukan di repo.")

    print("\n📝 Memperbarui manifest Cloud...")
    manifest_b64 = base64.b64encode(json.dumps(remaining_manifest, indent=2).encode("utf-8")).decode("utf-8")
    manifest_put_url = f"{WORKER_BASE_URL}/github/repos/{REPO_NAME}/contents/library/library-manifest.json"
    manifest_payload = {
        "message": f"Undo sync: Reset manifest (deleted {deleted_count} files)",
        "content": manifest_b64,
        "sha": manifest_sha,
        "branch": BRANCH_NAME
    }
    http_request(manifest_put_url, method="PUT", headers=headers_write, body_data=manifest_payload)
    print(f"\n✅ Selesai! Berhasil menghapus {deleted_count} lagu dari Cloud.")

# ============================= DRY RUN / PREVIEW LOGIC =============================
def dry_run_sync():
    """Mengurai semua file .pro ProPresenter 7 dan menyimpannya di folder preview lokal tanpa upload"""
    print("=" * 70)
    print(" 👁️ PRATINJAU LOKAL (DRY RUN - TANPA UPLOAD CLOUD)")
    print("=" * 70)

    default_dir = get_default_pro7_library_path()
    print(f"\n📂 Default Folder ProPresenter 7: {default_dir}")
    custom_dir = input(f"Tekan ENTER untuk menggunakan default, atau ketik path lain: ").strip()
    
    lib_dir = Path(custom_dir) if custom_dir else default_dir
    if not lib_dir.exists():
        print(f"❌ Error: Folder '{lib_dir}' tidak ditemukan!")
        return

    out_dir = Path(__file__).parent / "preview_output"
    out_dir.mkdir(exist_ok=True)

    pro_files = list(lib_dir.glob("**/*.pro"))
    print(f"\n🔍 Memproses {len(pro_files)} berkas lagu .pro...")

    success_count = 0
    for idx, pro_path in enumerate(pro_files, 1):
        parsed = decode_pro7_file(pro_path)
        if not parsed:
            continue

        out_file = out_dir / parsed["filename"]
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(parsed["text"])
        
        print(f"  [{idx}/{len(pro_files)}] ✅ Saved: {parsed['filename']} ({parsed['title']})")
        success_count += 1

    print("\n" + "=" * 70)
    print(f" 🎉 HASIL PRATINJAU LOKAL (DRY RUN):")
    print(f"   • Berhasil di-decode: {success_count} lagu")
    print(f"   • Lokasi Berkas TXT  : {out_dir.resolve()}")
    print("   💡 Silakan buka dan periksa berkas .txt di folder tersebut sebelum diunggah ke Cloud.")
    print("=" * 70)

# ============================= BATCH COMMIT LOGIC =============================
def create_batch_commit(tree_items: list, commit_message: str, headers_write: dict) -> bool:
    """
    Membuat BATCH COMMIT tunggal di GitHub yang mencakup SEMUA file baru & terupdate
    menggunakan GitHub Git Database Tree API (via Cloudflare Worker proxy).
    """
    print("\n📦 Membuat BATCH COMMIT tunggal di GitHub untuk seluruh berkas...")

    # 1. Dapatkan HEAD commit SHA saat ini
    ref_url = f"{WORKER_BASE_URL}/github/repos/{REPO_NAME}/git/ref/heads/{BRANCH_NAME}"
    s1, r1 = http_request(ref_url)
    if s1 != 200:
        print(f"❌ Gagal mengambil ref HEAD: {r1.get('error', s1)}")
        return False
    head_sha = r1["object"]["sha"]

    # 2. Dapatkan Tree SHA dari HEAD commit
    commit_url = f"{WORKER_BASE_URL}/github/repos/{REPO_NAME}/git/commits/{head_sha}"
    s2, r2 = http_request(commit_url)
    if s2 != 200:
        print(f"❌ Gagal mengambil commit details: {r2.get('error', s2)}")
        return False
    base_tree_sha = r2["tree"]["sha"]

    # 3. Buat Tree Baru dengan seluruh file dalam 1 payload
    tree_url = f"{WORKER_BASE_URL}/github/repos/{REPO_NAME}/git/trees"
    tree_payload = {
        "base_tree": base_tree_sha,
        "tree": tree_items
    }
    s3, r3 = http_request(tree_url, method="POST", headers=headers_write, body_data=tree_payload)
    if s3 not in (200, 201):
        print(f"❌ Gagal membuat Git tree baru: {r3.get('error', s3)}")
        return False
    new_tree_sha = r3["sha"]

    # 4. Buat Commit Baru
    create_commit_url = f"{WORKER_BASE_URL}/github/repos/{REPO_NAME}/git/commits"
    commit_payload = {
        "message": commit_message,
        "tree": new_tree_sha,
        "parents": [head_sha]
    }
    s4, r4 = http_request(create_commit_url, method="POST", headers=headers_write, body_data=commit_payload)
    if s4 not in (200, 201):
        print(f"❌ Gagal membuat commit baru: {r4.get('error', s4)}")
        return False
    new_commit_sha = r4["sha"]

    # 5. Update ref branch main ke commit baru
    update_ref_url = f"{WORKER_BASE_URL}/github/repos/{REPO_NAME}/git/refs/heads/{BRANCH_NAME}"
    ref_payload = {
        "sha": new_commit_sha,
        "force": False
    }
    s5, r5 = http_request(update_ref_url, method="PATCH", headers=headers_write, body_data=ref_payload)
    if s5 != 200:
        print(f"❌ Gagal meng-update branch ref main: {r5.get('error', s5)}")
        return False

    print(f"✅ BATCH COMMIT BERHASIL! (Commit SHA: {new_commit_sha[:7]})")
    return True


# ============================= MAIN SYNC LOGIC =============================
def main():
    if "--undo" in sys.argv or "--rollback" in sys.argv:
        undo_sync()
        return

    if "--dry-run" in sys.argv or "--preview" in sys.argv:
        dry_run_sync()
        return

    print("=" * 70)
    print(" 🎵 SYNC PROPRESENTER 7 TO SONGREPO CLOUD (DECODER V3 ENGINE)")
    print("=" * 70)
    print(" 1. Jalankan Sinkronisasi (Upload Batch Commit ke Cloud)")
    print(" 2. Pratinjau Lokal (Dry Run - Simpan ke Folder Tanpa Upload)")
    print(" 3. Undo / Hapus Semua Lagu Hasil Sync dari Cloud")
    mode = input(" Pilihan mode (1/2/3, default: 1): ").strip()

    if mode == "2":
        dry_run_sync()
        return
    elif mode == "3":
        undo_sync()
        return

    # 1. Lokasi Library ProPresenter 7
    default_dir = get_default_pro7_library_path()
    print(f"\n📂 Default Folder ProPresenter 7: {default_dir}")
    custom_dir = input(f"Tekan ENTER untuk menggunakan default, atau ketik path lain: ").strip()
    
    lib_dir = Path(custom_dir) if custom_dir else default_dir
    if not lib_dir.exists():
        print(f"❌ Error: Folder '{lib_dir}' tidak ditemukan!")
        return

    # 2. Input Password Admin
    admin_pwd = getpass.getpass("\n🔒 Masukkan Kata Sandi Admin Worker SongRepo: ").strip()
    if not admin_pwd:
        print("❌ Kata sandi tidak boleh kosong.")
        return

    admin_hash = hash_password(admin_pwd)
    headers_write = {
        "Content-Type": "application/json",
        "X-Admin-Hash": admin_hash
    }

    # 3. Ambil Manifest Cloud
    print("\n🌐 Mengambil manifest cloud dari GitHub via Worker...")
    manifest_url = f"{WORKER_BASE_URL}/github/repos/{REPO_NAME}/contents/library/library-manifest.json?ref={BRANCH_NAME}"
    status, manifest_res = http_request(manifest_url)
    
    existing_manifest = []
    if status == 200:
        content_b64 = manifest_res.get("content", "")
        raw_json = base64.b64decode(content_b64).decode("utf-8")
        existing_manifest = json.loads(raw_json)
        print(f"✅ Terhubung! Ditemukan {len(existing_manifest)} file di Cloud.")
    else:
        print("⚠️ Manifest belum ada di cloud. Akan membuat manifest baru.")

    # 4. Pindai Berkas .pro di Folder
    pro_files = list(lib_dir.glob("**/*.pro"))
    print(f"\n🔍 Ditemukan {len(pro_files)} berkas lagu ProPresenter 7 (.pro)")

    new_count = 0
    updated_count = 0
    skipped_count = 0
    manifest_set = set(existing_manifest)
    batch_tree_items = []

    for idx, pro_path in enumerate(pro_files, 1):
        parsed = decode_pro7_file(pro_path)
        if not parsed:
            continue

        filename = parsed["filename"]
        song_text = parsed["text"]
        new_hash = compute_content_hash(song_text)
        
        file_url = f"{WORKER_BASE_URL}/github/repos/{REPO_NAME}/contents/library/{filename}?ref={BRANCH_NAME}"
        file_status, file_res = http_request(file_url)

        if file_status == 200:
            existing_b64 = file_res.get("content", "").replace("\n", "").replace("\r", "")
            try:
                existing_text = base64.b64decode(existing_b64).decode("utf-8")
                existing_hash = compute_content_hash(existing_text)
            except Exception:
                existing_hash = ""

            if existing_hash == new_hash:
                print(f"  [{idx}/{len(pro_files)}] [SKIP] '{parsed['title']}' (Tidak ada perubahan)")
                skipped_count += 1
                continue
            else:
                print(f"  [{idx}/{len(pro_files)}] [UPDATE] '{parsed['title']}' (Lirik/chord diperbarui)")
                updated_count += 1
        else:
            print(f"  [{idx}/{len(pro_files)}] [BARU] '{parsed['title']}' (Lagu baru)")
            new_count += 1

        manifest_set.add(filename)
        batch_tree_items.append({
            "path": f"library/{filename}",
            "mode": "100644",
            "type": "blob",
            "content": song_text
        })

    # 5. Eksekusi BATCH COMMIT tunggal
    if batch_tree_items:
        updated_manifest_list = sorted(list(manifest_set))
        manifest_json_str = json.dumps(updated_manifest_list, indent=2)
        batch_tree_items.append({
            "path": "library/library-manifest.json",
            "mode": "100644",
            "type": "blob",
            "content": manifest_json_str
        })

        commit_msg = f"Sync ProPresenter 7: {new_count} lagu baru, {updated_count} diperbarui"
        success = create_batch_commit(batch_tree_items, commit_msg, headers_write)
        if not success:
            print("❌ Gagal mengeksekusi batch commit ke Cloud.")
    else:
        print("\n✨ Tidak ada perubahan lagu yang perlu diunggah.")

    print("\n" + "=" * 70)
    print(" 🎉 HASIL SINKRONISASI BATCH PROPRESENTER 7:")
    print(f"   • Lagu baru diunggah: {new_count}")
    print(f"   • Lagu diperbarui   : {updated_count}")
    print(f"   • Lagu dilewati     : {skipped_count}")
    print("=" * 70)

if __name__ == "__main__":
    main()
