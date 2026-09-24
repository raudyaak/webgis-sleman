# WebGIS Fasilitas Publik Kapanewon Depok

Versi ini sudah menggunakan data hasil ekstraksi dari dataset yang diunggah.

## Data yang terpasang
- 3 batas kalurahan: Caturtunggal, Condongcatur, Maguwoharjo
- 111 fasilitas publik
  - 77 pendidikan
  - 22 pemerintahan
  - 10 kesehatan
  - 2 ekonomi/pasar
- 100 ruas jalan kabupaten hasil clip ke Kapanewon Depok

## Tahun dataset
- Pendidikan: 2020
- Pemerintahan: 2021
- Batas administrasi: 2023
- Jalan kabupaten: 2023
- Puskesmas: 2025
- Rumah sakit: 2025
- Pasar: 2025

## CRS
Master GIS:
- EPSG:9489 — SRGI2013 / UTM zone 49S

WebGIS:
- EPSG:4326 — WGS 84

## Cara menjalankan
Gunakan VS Code + Live Server:
1. Buka folder project.
2. Klik kanan `index.html`.
3. Pilih `Open with Live Server`.

## Struktur penting
- `index.html` — landing page
- `map.html` — halaman WebGIS
- `data/fasilitas.geojson` — fasilitas publik
- `data/batas_kalurahan.geojson` — batas administrasi
- `data/jalan.geojson` — jalan
- `data_master/depok_master_processed.gpkg` — data master untuk QGIS


## Menjalankan dengan Live Server

Jangan membuka `index.html` atau `map.html` langsung dari File Explorer.

Gunakan langkah berikut:

1. Extract ZIP project.
2. Buka folder project di VS Code.
3. Klik kanan `index.html`.
4. Pilih `Open with Live Server`.
5. Browser seharusnya membuka alamat seperti:
   `http://127.0.0.1:5500/index.html`
6. Klik `Explore WebGIS`.

Basemap menggunakan:
- Leaflet 1.9.4
- OpenStreetMap tile:
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`

Jika alamat browser masih dimulai dengan `C:/` atau `file:///`, berarti project belum dijalankan melalui Live Server.
