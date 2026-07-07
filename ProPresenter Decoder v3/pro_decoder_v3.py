"""
pro_decoder_v3.py
Decoder file .pro (ProPresenter 7) menggunakan definisi protobuf RESMI
(hasil reverse-engineering dari https://github.com/greyshirtguy/ProPresenter7-Proto)
alih-alih menebak struktur biner dengan regex/varint manual.

Keuntungan dibanding versi v2 (regex-based):
- Urutan section (Verse/Chorus/dst) & urutan slide di dalamnya diambil LANGSUNG
  dari field `cue_groups` dan `cues`, bukan menebak dari pola UUID di teks mentah.
- Chord diambil dari field resmi `custom_attributes` (oneof `chord`, dengan
  `range.start` / `range.end`) di dalam `Text.Attributes`, bukan dari pencarian
  byte 0x6a di seluruh file.
- Judul lagu diambil dari field `name` Presentation, bukan ditebak dari string
  sebelum blok RTF.

Butuh: hasil `protoc --python_out` dari ProPresenter7-Proto (folder pb_out/),
dan pip package `protobuf`.
"""
import sys
import os
import re
import glob
import datetime
import xml.etree.ElementTree as ET
import xml.dom.minidom as minidom

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "pb_out"))
import presentation_pb2  # noqa: E402


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


_RTF_DESTINATION_GROUPS = re.compile(
    r'\{\\(?:fonttbl|colortbl|\*\\[a-zA-Z]+)[^{}]*\}'
)


def rtf_to_text(rtf_bytes):
    """Konversi payload RTF (bytes) dari field rtf_data menjadi plain-text lirik.

    Pendekatan generik (bukan mengandalkan marker \\cb2, yang hanya muncul di
    sebagian varian RTF ProPresenter): buang grup tabel font/warna, ubah
    penanda baris baru (\\par, \\line, backslash-newline literal) menjadi baris
    baru, decode escape RTF (\\'xx, \\uNNNN), lalu hapus sisa control word.
    """
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
    """chords: list of (start_char, end_char, chord_name), posisi dihitung dari
    gabungan semua baris (tanpa newline), sesuai field range resmi protobuf."""
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
    """Ambil teks (+ chord) HANYA dari elemen pertama slide, plus catatan
    per-slide (PresentationSlide.notes) jika ada, ditandai tag [NOTES]
    (mirip tag [CHORD]).
    Elemen kedua/berikutnya biasanya kotak teks tambahan (mis. placeholder
    "Lorem ipsum" yang tidak terisi) dan bukan bagian dari lirik utama."""
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


def process_file(file_path):
    with open(file_path, "rb") as f:
        data = f.read()

    pres = presentation_pb2.Presentation()
    pres.ParseFromString(data)

    title = pres.name or os.path.splitext(os.path.basename(file_path))[0]

    # Peta uuid -> teks slide, dibangun dari `cues` (setiap cue = satu slide utama)
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
        # Urutan section & urutan slide di dalamnya diambil LANGSUNG dari
        # struktur resmi cue_groups, bukan tebakan regex.
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

    # Cue yang tidak masuk ke cue_group manapun tetap disertakan
    leftover = [cue_text_by_uuid[cue.uuid.string]
                for cue in pres.cues
                if cue.uuid.string in cue_text_by_uuid and cue.uuid.string not in used_uuids]
    if leftover:
        sections.append(("Unsectioned", "\n\n".join(leftover)))

    if not sections:
        raise Exception("Tidak ada lirik yang bisa diekstrak (kemungkinan semua slide kosong).")

    sections = number_repeated_sections(sections)

    parts = [title, ""]
    if pres.notes:
        parts.append("[NOTES]")
        parts.append("")
        parts.append(pres.notes)
        parts.append("")
    for label, text in sections:
        parts.append(f"[{label}]")
        parts.append("")
        parts.append(text)
        parts.append("")
    return "\n".join(parts).rstrip() + "\n"


ASCII_ART = r"""
  ____            ____ _____   ____                     _           
 |  _ \ _ __ ___ |  _ \___  | |  _ \  ___  ___ ___   __| | ___ _ __ 
 | |_) | '__/ _ \| |_) | / /  | | | |/ _ \/ __/ _ \ / _` |/ _ \ '__|
 |  __/| | | (_) |  __/ / /   | |_| |  __/ (_| (_) | (_| |  __/ |   
 |_|   |_|  \___/|_|   /_/    |____/ \___|\___\___/ \__,_|\___|_|   
                                                                    
Decode Lirik & Chord dari File .pro ProPresenter 7 ke Teks
""".strip("\n")


def _print_progress(current, total, nama_file, bar_width=30):
    filled = int(bar_width * current / total)
    bar = "#" * filled + "-" * (bar_width - filled)
    label = nama_file if len(nama_file) <= 40 else nama_file[:37] + "..."
    line = f"[{bar}] {current}/{total}  {label}"
    # Padding agar sisa teks baris sebelumnya (jika lebih panjang) tertimpa bersih
    sys.stdout.write("\r" + line.ljust(90))
    sys.stdout.flush()


def _write_log_xml(output_dir, start_time, total, sukses, gagal, sukses_files, gagal_details):
    root = ET.Element("log")
    ET.SubElement(root, "tanggal").text = start_time.strftime("%Y-%m-%d")
    ET.SubElement(root, "waktu").text = start_time.strftime("%H:%M:%S")
    summary = ET.SubElement(root, "summary")
    summary.set("total", str(total))
    summary.set("berhasil", str(sukses))
    summary.set("gagal", str(gagal))

    successes = ET.SubElement(root, "file_berhasil")
    for nama_file, output_filename in sukses_files:
        f = ET.SubElement(successes, "file")
        f.set("nama", nama_file)
        f.set("output", output_filename)

    failures = ET.SubElement(root, "file_gagal")
    for nama_file, alasan in gagal_details:
        f = ET.SubElement(failures, "file")
        f.set("nama", nama_file)
        f.set("alasan", alasan)

    rough_string = ET.tostring(root, encoding="utf-8")
    pretty = minidom.parseString(rough_string).toprettyxml(indent="  ")
    log_path = os.path.join(output_dir, "log.xml")
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(pretty)
    return log_path


if __name__ == "__main__":
    # Argumen opsional: path direktori tempat file .pro berada.
    # Jika tidak diberikan, pakai direktori kerja saat ini (".").
    target_dir = sys.argv[1] if len(sys.argv) > 1 else "."

    print(ASCII_ART)
    print("-" * 40)

    if not os.path.isdir(target_dir):
        print(f"Direktori tidak ditemukan: {target_dir}")
        sys.exit(1)

    pro_files = glob.glob(os.path.join(target_dir, "*.pro"))
    if not pro_files:
        print(f"Tidak ditemukan file .pro di folder: {target_dir}")
        sys.exit(0)

    # Hasil decode disimpan di subfolder terpisah "decoded_output",
    # bukan bercampur dengan file .pro asli.
    output_dir = os.path.join(target_dir, "decoded_output")
    os.makedirs(output_dir, exist_ok=True)

    start_time = datetime.datetime.now()
    total = len(pro_files)
    sukses = 0
    gagal = 0
    gagal_files = []
    sukses_files = []  # list of (nama_file, output_filename)
    gagal_details = []  # list of (nama_file, alasan)

    for idx, file_path in enumerate(pro_files, start=1):
        nama_file = os.path.basename(file_path)
        _print_progress(idx, total, nama_file)
        try:
            hasil = process_file(file_path)
            base_name = os.path.splitext(nama_file)[0]
            output_filename = os.path.join(output_dir, f"{base_name}_decoded.txt")
            with open(output_filename, "w", encoding="utf-8") as out_file:
                out_file.write(hasil)
            sukses += 1
            sukses_files.append((nama_file, output_filename))
        except Exception as e:
            gagal += 1
            gagal_files.append(nama_file)
            gagal_details.append((nama_file, str(e)))

    # Selesaikan baris progress bar dengan pindah baris baru
    sys.stdout.write("\n")
    sys.stdout.flush()

    log_path = _write_log_xml(output_dir, start_time, total, sukses, gagal, sukses_files, gagal_details)

    print("-" * 40)
    print("Batch proses selesai!")
    print(f"Total berhasil: {sukses}")
    print(f"Total gagal   : {gagal}")
    if gagal_files:
        print(f"File gagal    : {' '.join(gagal_files)}")
    print(f"Log tersimpan : {log_path}")
