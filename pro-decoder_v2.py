import sys
import os
import re
import glob
import bisect

# Daftar nama section yang akan dideteksi
SECTION_NAMES = [
    "Intro", "Verse", "Pre Chorus", "Pre-Chorus", "Chorus", "Bridge",
    "Tag", "Ending", "Outro", "Interlude", "Instrumental", "Refrain"
]

def extract_rtf_blocks(text, with_offsets=False):
    """Mengekstrak blok kode RTF dengan menyeimbangkan kurung kurawal '{}'.
    Jika with_offsets=True, juga mengembalikan daftar posisi (index) awal
    setiap blok pada `text`, dibutuhkan untuk mencocokkan data chord."""
    blocks = []
    offsets = []
    start = 0
    marker = "{\\rtf"
    
    while True:
        idx = text.find(marker, start)
        if idx == -1: 
            return (blocks, offsets) if with_offsets else blocks
            
        depth = 0
        escaped = False
        
        for pos in range(idx, len(text)):
            ch = text[pos]
            if escaped:
                escaped = False
                continue
            if ch == "\\":
                escaped = True
                continue
            if ch == "{": 
                depth += 1
            if ch == "}":
                depth -= 1
                if depth == 0:
                    blocks.append(text[idx:pos + 1])
                    offsets.append(idx)
                    start = pos + 1
                    break
                    
        if start <= idx: 
            return (blocks, offsets) if with_offsets else blocks

def decode_rtf_escapes(value):
    """Menerjemahkan escape character RTF ke dalam teks normal."""
    def repl_u(m):
        code = int(m.group(1))
        normalized = code + 65536 if code < 0 else code
        return chr(normalized)
    
    value = re.sub(r'\\u(-?\d+)\s?\?', repl_u, value)
    
    def repl_hex(m):
        return chr(int(m.group(1), 16))
    
    value = re.sub(r"\\'([0-9a-fA-F]{2})", repl_hex, value)
    
    value = value.replace("\\{", "{").replace("\\}", "}").replace("\\\\", "\\")
    return value

def rtf_to_text(rtf):
    """Mengonversi RTF menjadi plain-text lirik."""
    lines = []
    pattern = re.compile(r'\\cb2\s([\s\S]*?)(?=(?:\\par|}))')
    
    for match in pattern.findall(rtf):
        line = decode_rtf_escapes(match)
        line = re.sub(r'\\[a-zA-Z]+-?\d* ?', '', line).strip()
        if line: 
            lines.append(line)
            
    return "\n".join(lines)

CHORD_NAME_RE = re.compile(r'^[A-G](#|b)?(m|maj|min|dim|aug|sus)?\d*(/[A-G](#|b)?)?$')

def _read_varint(data, pos):
    """Membaca satu varint protobuf dari `data` mulai posisi `pos`."""
    result = 0
    shift = 0
    while True:
        b = data[pos]
        pos += 1
        result |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7
    return result, pos

def _parse_protobuf_message(data):
    """Parser protobuf sederhana: mengembalikan dict {field_number: [values]}."""
    fields = {}
    pos = 0
    try:
        while pos < len(data):
            tag, pos = _read_varint(data, pos)
            field = tag >> 3
            wire = tag & 7
            if wire == 0:
                val, pos = _read_varint(data, pos)
            elif wire == 2:
                length, pos = _read_varint(data, pos)
                val = data[pos:pos + length]
                pos += length
            elif wire == 5:
                val = data[pos:pos + 4]
                pos += 4
            elif wire == 1:
                val = data[pos:pos + 8]
                pos += 8
            else:
                return None
            fields.setdefault(field, []).append(val)
    except IndexError:
        return None
    return fields

def extract_chord_entries(raw_bytes):
    """Mencari data chord (field protobuf #13, byte 0x6a) di seluruh file.
    Setiap entri chord berisi rentang karakter (start, end) relatif terhadap
    teks lirik slide yang mengikutinya, beserta nama chord (contoh: "Bb", "F", "C").
    Mengembalikan list (byte_offset, start_char, end_char, chord_name)."""
    entries = []
    i = 0
    n = len(raw_bytes)
    
    while i < n - 1:
        if raw_bytes[i] == 0x6a:  # field 13, wiretype 2 (length-delimited)
            try:
                length, pos_after_len = _read_varint(raw_bytes, i + 1)
            except IndexError:
                i += 1
                continue
                
            content = raw_bytes[pos_after_len:pos_after_len + length]
            if len(content) == length and 0 < length < 40:
                fields = _parse_protobuf_message(content)
                if fields and 1 in fields and 7 in fields:
                    range_field = fields[1][0]
                    name_field = fields[7][0]
                    if isinstance(range_field, bytes):
                        sub = _parse_protobuf_message(range_field)
                        if sub is not None:
                            start_char = sub.get(1, [0])[0]
                            end_char = sub.get(2, [None])[0]
                            if isinstance(start_char, int) and isinstance(end_char, int) and isinstance(name_field, bytes):
                                try:
                                    name = name_field.decode("ascii")
                                    if name.strip() and CHORD_NAME_RE.match(name):
                                        entries.append((i, start_char, end_char, name))
                                except Exception:
                                    pass
        i += 1
        
    return entries

CHORD_LINE_TAG = "[CHORD]"

def build_chord_line(line, local_chords):
    """Membuat baris chord yang sejajar (align) di atas baris lirik.
    local_chords: list of (posisi_karakter, nama_chord).
    Baris diberi prefix CHORD_LINE_TAG agar bisa dengan mudah dideteksi
    dan diabaikan (di-filter) oleh aplikasi JS di proses selanjutnya."""
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
    """Menyisipkan baris chord (ChordPro style, baris terpisah di atas lirik)
    ke dalam teks lirik multi-baris `text`.
    `chords`: list of (start_char, end_char, chord_name), dengan posisi karakter
    dihitung dari gabungan semua baris tanpa pemisah (tanpa newline)."""
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

def extract_title(text, fallback_name):
    """Mendeteksi judul lagu dengan mencari string yang valid sebelum blok RTF pertama."""
    idx = text.find("{\\rtf")
    before_rtf = text[:idx] if idx >= 0 else text
    
    candidates = []
    for match in re.finditer(r'[ -~]{4,}', before_rtf):
        val = match.group(0)
        val = re.sub(r'^[^A-Za-z0-9(]+', '', val)
        val = re.sub(r'["*#:]+$', '', val).strip()
        candidates.append(val)
        
    filtered = []
    for val in candidates:
        if not val or not re.search(r'[A-Za-z]', val): continue
        if re.match(r'^[0-9]+$', val): continue
        if re.match(r'^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}$', val): continue
        if val in SECTION_NAMES: continue
        if re.match(r'^(Arial|Regular|Media/|h264)', val, re.IGNORECASE): continue
        if re.match(r'^[A-Z]:\\', val, re.IGNORECASE): continue
        if re.search(r'\.(mp4|mov|jpg|png)$', val, re.IGNORECASE): continue
        filtered.append(val)
        
    for val in filtered:
        if re.search(r'\(Animasi\)|\bN20\d{2}\b', val):
            return val
            
    if filtered:
        return filtered[0]
        
    return re.sub(r'\.pro$', '', fallback_name, flags=re.IGNORECASE).strip()

def infer_sections(text, slide_count):
    """Mendeteksi struktur lagu (Verse, Chorus, dll.) dengan menganalisis UUID dan marker."""
    idx = text.find("{\\rtf")
    preamble = text[:idx] if idx >= 0 else text
    
    uuid_pattern = r'\$[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{10,13}'
    section_pattern = "|".join(re.escape(s) for s in SECTION_NAMES)
    marker_pattern = re.compile(rf'{uuid_pattern}[\s\S]{{0,60}}?\b({section_pattern})\b')
    slide_ref_pattern = re.compile(rf'\x12&\n{uuid_pattern}')
    
    markers = []
    for match in marker_pattern.finditer(preamble):
        markers.append({"index": match.start(), "end": match.end(), "label": match.group(1)})
        
    sections = []
    i = 0
    while i < len(markers):
        current = markers[i]
        next_marker = markers[i+1] if i+1 < len(markers) else None
        
        if next_marker and next_marker["label"] == current["label"]:
            after_duplicate = next_marker["end"]
            # Perbaikan logika batas end mengikuti versi JS aslinya
            end = markers[i+2]["end"] if i+2 < len(markers) else len(preamble)
            chunk = preamble[after_duplicate:end]
            count = len(slide_ref_pattern.findall(chunk))
            
            if count > 0:
                sections.append({"label": current["label"], "count": count})
            i += 1 
        i += 1
        
    total = sum(item["count"] for item in sections)
    if sections and total == slide_count:
        return sections
    if sections and total < slide_count:
        sections.append({"label": "Unsectioned", "count": slide_count - total})
        return sections
        
    return [{"label": "Lyrics", "count": slide_count}]

def number_repeated_sections(sections):
    """Menambahkan penomoran pada section yang berulang (contoh: Verse 1, Verse 2)."""
    totals = {}
    for sec in sections:
        totals[sec["label"]] = totals.get(sec["label"], 0) + 1
        
    seen = {}
    numbered_sections = []
    
    for sec in sections:
        if totals[sec["label"]] == 1:
            numbered_sections.append(sec)
        else:
            seen[sec["label"]] = seen.get(sec["label"], 0) + 1
            numbered_sections.append({
                "label": f'{sec["label"]} {seen[sec["label"]]}',
                "count": sec["count"]
            })
            
    return numbered_sections

def build_output(title, sections, slides):
    """Menyusun hasil akhir lirik dan section menjadi sebuah teks rapi."""
    parts = [title, ""]
    cursor = 0
    
    for section in number_repeated_sections(sections):
        parts.extend([f'[{section["label"]}]', ""])
        selected = slides[cursor : cursor + section["count"]]
        
        for slide in selected:
            parts.extend(slide.splitlines())
            
        parts.append("")
        cursor += section["count"]
        
    return "\n".join(parts).rstrip() + "\n"

def process_file(file_path):
    """Fungsi utama untuk memproses file `.pro` dan mengembalikan lirik teks."""
    try:
        # PERBAIKAN KRUSIAL: Membaca secara binary ('rb') agar 
        # struktur delimiter file protobuf tidak rusak/diubah otomatis oleh Python
        with open(file_path, "rb") as f:
            raw_bytes = f.read()
        current_text = raw_bytes.decode("windows-1252", errors="replace")
    except Exception as e:
        raise Exception(f"Error membaca file: {e}")

    # Ekstraksi blok RTF beserta posisi (offset) masing-masing, untuk
    # mencocokkan data chord (jika ada) dengan slide yang bersangkutan.
    rtf_blocks, rtf_offsets = extract_rtf_blocks(current_text, with_offsets=True)
    chord_entries = extract_chord_entries(raw_bytes)

    # Kelompokkan setiap entri chord ke blok RTF yang mengikutinya
    # (data chord selalu muncul tepat sebelum blok RTF slide miliknya).
    chords_by_block_idx = {}
    for byte_offset, start_char, end_char, name in chord_entries:
        block_idx = bisect.bisect_right(rtf_offsets, byte_offset)
        if block_idx < len(rtf_offsets):
            chords_by_block_idx.setdefault(block_idx, []).append((start_char, end_char, name))

    # Ekstraksi dan mapping lirik, sisipkan chord (jika ada) per slide
    lyric_slides = []
    for idx, rtf in enumerate(rtf_blocks):
        slide_text = rtf_to_text(rtf)
        if not slide_text:
            continue
        slide_chords = chords_by_block_idx.get(idx, [])
        slide_text = insert_chords_into_text(slide_text, slide_chords)
        lyric_slides.append(slide_text)

    if not lyric_slides:
        raise Exception("Tidak menemukan lirik RTF pada file ini.")

    file_name = os.path.basename(file_path)
    title = extract_title(current_text, file_name)
    detected_sections = infer_sections(current_text, len(lyric_slides))

    return build_output(title, detected_sections, lyric_slides)

if __name__ == "__main__":
    # Mencari semua file dengan ekstensi .pro di folder saat ini
    pro_files = glob.glob("*.pro")
    
    if not pro_files:
        print("❌ Tidak ditemukan file .pro di folder ini.")
        sys.exit(0)

    print(f"🔍 Ditemukan {len(pro_files)} file .pro. Memulai proses batch...")
    print("-" * 40)
    
    sukses = 0
    gagal = 0

    # Looping / iterasi untuk setiap file .pro yang ditemukan
    for file_path in pro_files:
        print(f"Memproses: {file_path} ...", end=" ")
        
        try:
            hasil = process_file(file_path)
            
            base_name = os.path.splitext(os.path.basename(file_path))[0]
            output_filename = f"{base_name}_decoded.txt"
            
            with open(output_filename, "w", encoding="utf-8") as out_file:
                out_file.write(hasil)
            print(f"✅ Tersimpan sebagai '{output_filename}'")
            sukses += 1
        except Exception as e:
            print(f"❌ Gagal memproses: {e}")
            gagal += 1

    print("-" * 40)
    print("🎉 Batch proses selesai!")
    print(f"Total berhasil: {sukses}")
    if gagal > 0:
        print(f"Total gagal   : {gagal}")