# Perpustakaan Lagu — panduan hosting di GitHub Pages

## Struktur folder

```
repo-kamu/
├── .github/workflows/build-manifest.yml   ← auto-generate manifest saat push
└── library/
    ├── app.html                            ← buka file ini di browser
    ├── library-manifest.json               ← daftar nama file .txt (auto)
    ├── Kubersyukur Bapa (Animasi).txt
    ├── Bapa Engkau Baik.txt
    └── ... (lagu lain)
```

## Kenapa perlu manifest.json?

GitHub Pages adalah static hosting — tidak ada "directory listing" seperti di
server Apache/Nginx biasa. Browser tidak bisa tahu isi folder `library/` tanpa
diberi tahu daftarnya lewat file `library-manifest.json`.

## Cara pakai

1. Taruh semua file `.txt` lagu di folder `library/`, sejajar dengan `app.html`.
2. Commit & push ke branch `main`.
3. GitHub Action (`build-manifest.yml`) otomatis jalan, memindai semua file
   `.txt` di folder `library/`, dan menulis ulang `library-manifest.json`
   lalu meng-commit-nya balik ke repo.
4. Aktifkan GitHub Pages (Settings → Pages → Deploy from branch → `main`,
   folder root atau `/library` sesuai kebutuhan).
5. Buka `https://username.github.io/repo-kamu/library/app.html` (sesuaikan
   path-nya dengan setting Pages kamu).

## Update manifest secara manual (opsional, tanpa Actions)

Kalau suatu saat tidak mau pakai GitHub Actions, manifest bisa digenerate
manual di komputer sebelum push:

```bash
cd library
python3 -c "
import json, os
files = sorted(f for f in os.listdir('.') if f.lower().endswith('.txt'))
json.dump(files, open('library-manifest.json','w', encoding='utf-8'), ensure_ascii=False, indent=2)
"
```

## Catatan

- Nama file yang mengandung kata "animasi" (dalam bentuk apa pun — "Animasi",
  "(Animasi)", "(v2animasi)", dst.) otomatis masuk ke tab "Lagu dengan
  Animasi". Sisanya masuk ke tab "Lagu".
- Format lirik di dalam `.txt` tetap sama seperti contoh: baris pertama
  `Title: ...` (opsional), lalu section ditandai `[VERSE]`, `[CHORUS]`,
  `[BRIDGE]`, dll masing-masing di baris sendiri.
