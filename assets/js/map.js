const map = L.map('map', {
  zoomControl: true,
  preferCanvas: true
}).setView([-7.77, 110.41], 13);

const osm = L.tileLayer(
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
    crossOrigin: true
  }
).addTo(map);

const categoryStyle = {
  Kesehatan: { className: 'marker-health', icon: 'fa-hospital', label: 'Kesehatan' },
  Pendidikan: { className: 'marker-education', icon: 'fa-graduation-cap', label: 'Pendidikan' },
  Pemerintahan: { className: 'marker-government', icon: 'fa-building-columns', label: 'Pemerintahan' },
  Ekonomi: { className: 'marker-economy', icon: 'fa-store', label: 'Ekonomi' }
};

let facilities = [];
const markers = [];
let boundaryLayer = null;
let roadLayer = null;
const villageLayers = {};
let selectedVillageLayer = null;

function createIcon(category) {
  const cfg = categoryStyle[category] || { className: '', icon: 'fa-location-dot', label: category || 'Fasilitas' };
  return L.divIcon({
    className: `custom-marker ${cfg.className}`,
    html: `<div class="marker-pin" title="${cfg.label}"><span><i class="fa-solid ${cfg.icon}"></i></span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -28]
  });
}

function popupContent(feature) {
  const p = feature.properties;
  return `
    <div class="popup-card">
      <span>${p.kategori || '-'}</span>
      <h3>${p.nama || 'Tanpa nama'}</h3>
      <p><strong>Subkategori:</strong> ${p.subkategori || '-'}</p>
      <p><strong>Kalurahan:</strong> ${p.kalurahan || '-'}</p>
      ${p.alamat ? `<p><strong>Alamat:</strong> ${p.alamat}</p>` : ''}
      <p><strong>Tahun data:</strong> ${p.tahun || '-'}</p>
      <p><strong>Sumber:</strong> ${p.sumber || '-'}</p>
      <div class="popup-actions">
        <button class="popup-chip focus-village-btn" data-village="${p.kalurahan || ''}">
          <i class="fa-solid fa-vector-square"></i> Lihat batas kalurahan
        </button>
      </div>
    </div>
  `;
}

function selectedCategories() {
  return [...document.querySelectorAll('.category-filter:checked')].map(el => el.value);
}

function defaultBoundaryStyle() {
  return {
    color: '#1f6f5f',
    weight: 2,
    fillColor: '#8fc8b8',
    fillOpacity: 0.08
  };
}

function highlightBoundary(layer) {
  if (selectedVillageLayer && selectedVillageLayer !== layer) {
    selectedVillageLayer.setStyle(defaultBoundaryStyle());
  }
  selectedVillageLayer = layer;
  layer.setStyle({
    color: '#0e5a4b',
    weight: 3,
    fillColor: '#65b49f',
    fillOpacity: 0.22
  });
  if (layer.bringToFront) layer.bringToFront();
}

function clearBoundaryHighlight() {
  Object.values(villageLayers).forEach(layer => layer.setStyle(defaultBoundaryStyle()));
  selectedVillageLayer = null;
}

function facilityCountByVillage(village) {
  return facilities.filter(f => (f.properties.kalurahan || '') === village).length;
}

function villagePopupContent(props) {
  const count = facilityCountByVillage(props.kalurahan);
  return `
    <div class="popup-card kalurahan-popup">
      <span>KALURAHAN</span>
      <h3>${props.kalurahan}</h3>
      <p><strong>Kapanewon:</strong> ${props.kapanewon || '-'}</p>
      <p><strong>Luas:</strong> ${Number(props.luas_ha || 0).toFixed(2)} ha</p>
      <p><strong>Jumlah fasilitas:</strong> ${count} titik</p>
      <div class="popup-actions">
        <button class="popup-chip apply-village-filter" data-village="${props.kalurahan}">
          <i class="fa-solid fa-filter"></i> Filter fasilitas
        </button>
      </div>
    </div>
  `;
}

function focusOnVillage(village, applyVillageFilter = false) {
  const layer = villageLayers[village];
  if (!layer) return;

  highlightBoundary(layer);
  map.fitBounds(layer.getBounds(), { padding: [36, 36] });
  layer.openPopup();

  if (applyVillageFilter) {
    document.getElementById('villageFilter').value = village;
    applyFilters();
  }
}

async function loadSpatialLayers() {
  const [boundaryRes, roadRes, facilityRes] = await Promise.all([
    fetch('data/batas_kalurahan.geojson'),
    fetch('data/jalan.geojson'),
    fetch('data/fasilitas.geojson')
  ]);

  const boundaryData = await boundaryRes.json();
  const roadData = await roadRes.json();
  const facilityData = await facilityRes.json();

  facilities = facilityData.features || [];

  boundaryLayer = L.geoJSON(boundaryData, {
    style: defaultBoundaryStyle,
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      villageLayers[p.kalurahan] = layer;
      layer.bindTooltip(
        `<strong>${p.kalurahan}</strong><br>Kapanewon ${p.kapanewon}`,
        { sticky: true }
      );
      layer.bindPopup(villagePopupContent(p));
      layer.on('click', () => {
        highlightBoundary(layer);
      });
    }
  }).addTo(map);

  roadLayer = L.geoJSON(roadData, {
    style: {
      color: '#77827f',
      weight: 1.4,
      opacity: 0.55
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      if (p.nama_jalan) {
        layer.bindTooltip(p.nama_jalan, { sticky: true });
      }
    }
  }).addTo(map);

  facilities.forEach(feature => {
    if (!feature.geometry || feature.geometry.type !== 'Point') return;
    const [lng, lat] = feature.geometry.coordinates;

    const marker = L.marker([lat, lng], {
      icon: createIcon(feature.properties.kategori)
    }).bindPopup(popupContent(feature));

    marker.featureData = feature;
    marker.addTo(map);
    markers.push(marker);
  });

  updateCounts();
  applyFilters();

  if (boundaryLayer) {
    map.fitBounds(boundaryLayer.getBounds(), { padding: [20, 20] });
  }

  L.control.layers(
    { OpenStreetMap: osm },
    {
      'Batas Kalurahan': boundaryLayer,
      'Jalan Kabupaten': roadLayer
    },
    { collapsed: false }
  ).addTo(map);
}

function updateCounts() {
  const counts = {
    Kesehatan: 0,
    Pendidikan: 0,
    Pemerintahan: 0,
    Ekonomi: 0
  };

  facilities.forEach(feature => {
    const cat = feature.properties.kategori;
    if (Object.prototype.hasOwnProperty.call(counts, cat)) counts[cat]++;
  });

  document.getElementById('count-health').textContent = counts.Kesehatan;
  document.getElementById('count-education').textContent = counts.Pendidikan;
  document.getElementById('count-government').textContent = counts.Pemerintahan;
  document.getElementById('count-economy').textContent = counts.Ekonomi;
  document.getElementById('totalFacilities').textContent = facilities.length;
}

function applyFilters() {
  const categories = selectedCategories();
  const village = document.getElementById('villageFilter').value;
  const keyword = document.getElementById('searchInput').value.trim().toLowerCase();

  let visible = 0;

  markers.forEach(marker => {
    const p = marker.featureData.properties;

    const categoryMatch = categories.includes(p.kategori);
    const villageMatch = village === 'Semua' || p.kalurahan === village;
    const keywordMatch =
      !keyword ||
      (p.nama || '').toLowerCase().includes(keyword) ||
      (p.subkategori || '').toLowerCase().includes(keyword) ||
      (p.kalurahan || '').toLowerCase().includes(keyword);

    const shouldShow = categoryMatch && villageMatch && keywordMatch;

    if (shouldShow) {
      if (!map.hasLayer(marker)) marker.addTo(map);
      visible++;
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    }
  });

  if (village !== 'Semua') {
    focusOnVillage(village, false);
  } else {
    clearBoundaryHighlight();
  }

  document.getElementById('visibleFacilities').textContent = visible;
  const villageText = village === 'Semua' ? 'semua kalurahan' : village;
  document.getElementById('mapStatus').textContent = `${visible} fasilitas · ${villageText}`;
}

document.querySelectorAll('.category-filter').forEach(el => {
  el.addEventListener('change', applyFilters);
});

document.getElementById('villageFilter').addEventListener('change', applyFilters);
document.getElementById('searchInput').addEventListener('input', applyFilters);

document.getElementById('resetFilters').addEventListener('click', () => {
  document.querySelectorAll('.category-filter').forEach(el => el.checked = true);
  document.getElementById('villageFilter').value = 'Semua';
  document.getElementById('searchInput').value = '';
  clearBoundaryHighlight();
  applyFilters();
});

document.querySelectorAll('.village-focus').forEach(btn => {
  btn.addEventListener('click', () => {
    const village = btn.dataset.village;
    focusOnVillage(village, true);
  });
});

const accessPanel = document.getElementById('accessPanel');

document.getElementById('accessButton').addEventListener('click', () => {
  accessPanel.classList.remove('hidden');
});

document.getElementById('closeAccessPanel').addEventListener('click', () => {
  accessPanel.classList.add('hidden');
});

const sidebar = document.getElementById('sidebar');
document.getElementById('sidebarToggle').addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

map.on('popupopen', e => {
  const popupEl = e.popup.getElement();
  if (!popupEl) return;

  popupEl.querySelectorAll('.focus-village-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      focusOnVillage(btn.dataset.village, true);
      map.closePopup();
    });
  });

  popupEl.querySelectorAll('.apply-village-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('villageFilter').value = btn.dataset.village;
      applyFilters();
      map.closePopup();
    });
  });
});

loadSpatialLayers().catch(err => {
  console.error(err);
  document.getElementById('mapStatus').textContent = 'Gagal memuat data. Jalankan melalui Live Server.';
});
