const map = L.map('map', {
  zoomControl: true,
  preferCanvas: true
}).setView([-7.77, 110.41], 13);

const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
  crossOrigin: true
}).addTo(map);

const categoryStyle = {
  Kesehatan: { className: 'marker-health', icon: 'fa-hospital', label: 'Kesehatan' },
  Pendidikan: { className: 'marker-education', icon: 'fa-school', label: 'Pendidikan' },
  Pemerintahan: { className: 'marker-government', icon: 'fa-building-columns', label: 'Pemerintahan' },
  Ekonomi: { className: 'marker-economy', icon: 'fa-store', label: 'Ekonomi' }
};

const subcategoryIcons = {
  'Rumah Sakit': 'fa-hospital',
  'Puskesmas': 'fa-house-medical',
  'SD': 'fa-child-reaching',
  'SMP': 'fa-school',
  'SMA': 'fa-graduation-cap',
  'SMK': 'fa-screwdriver-wrench',
  'Kantor Pemerintah': 'fa-building-columns',
  'Pasar': 'fa-store'
};

const categoryFolder = {
  Kesehatan: 'kesehatan',
  Pendidikan: 'pendidikan',
  Pemerintahan: 'pemerintahan',
  Ekonomi: 'ekonomi'
};

let facilities = [];
const markers = [];
let boundaryLayer = null;
let roadLayer = null;
const villageLayers = {};
let selectedVillageLayer = null;
let roadGraph = null;

// Accessibility-analysis state
const analysisLayer = L.layerGroup().addTo(map);
let originLatLng = null;
let originMarker = null;
let bufferLayer = null;
let routeLayer = null;
let targetHalo = null;
let manualOriginMode = false;
let lastAnalysis = null;

function safeText(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function createIcon(feature) {
  const p = feature.properties || {};
  const cfg = categoryStyle[p.kategori] || { className: '', icon: 'fa-location-dot', label: p.kategori || 'Fasilitas' };
  const icon = subcategoryIcons[p.subkategori] || cfg.icon;
  const shortLabel = safeText(p.subkategori || cfg.label);
  return L.divIcon({
    className: `custom-marker ${cfg.className}`,
    html: `
      <div class="marker-pin marker-interactive" title="${safeText(p.nama || shortLabel)}">
        <span><i class="fa-solid ${icon}" aria-hidden="true"></i></span>
      </div>`,
    iconSize: [40, 44],
    iconAnchor: [20, 42],
    popupAnchor: [0, -37],
    tooltipAnchor: [0, -30]
  });
}

function fallbackPhoto(feature) {
  const folder = categoryFolder[feature.properties?.kategori] || 'lainnya';
  return `assets/fasilitas/${folder}/placeholder.jpg`;
}

function popupContent(feature) {
  const p = feature.properties || {};
  const photo = p.foto || fallbackPhoto(feature);
  const fallback = fallbackPhoto(feature);
  return `
    <div class="popup-card facility-popup">
      <div class="popup-photo-wrap">
        <img class="popup-photo" src="${safeText(photo)}" alt="Foto ${safeText(p.nama || 'fasilitas')}"
          onerror="this.onerror=null;this.src='${safeText(fallback)}';">
        <span class="popup-category-tag">${safeText(p.subkategori || p.kategori || '-')}</span>
      </div>
      <div class="popup-body">
        <h3>${safeText(p.nama || 'Tanpa nama')}</h3>
        <p><strong>Kategori:</strong> ${safeText(p.kategori || '-')}</p>
        <p><strong>Kalurahan:</strong> ${safeText(p.kalurahan || '-')}</p>
        ${p.alamat ? `<p><strong>Alamat:</strong> ${safeText(p.alamat)}</p>` : ''}
        <p><strong>Tahun data:</strong> ${safeText(p.tahun || '-')}</p>
        <p><strong>Sumber:</strong> ${safeText(p.sumber || '-')}</p>
        <div class="popup-actions">
          <button class="popup-chip focus-village-btn" data-village="${safeText(p.kalurahan || '')}">
            <i class="fa-solid fa-vector-square"></i> Batas kalurahan
          </button>
          <button class="popup-chip route-facility-btn" data-facility-id="${safeText(p.id)}">
            <i class="fa-solid fa-route"></i> Rute dari origin
          </button>
        </div>
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
      <h3>${safeText(props.kalurahan)}</h3>
      <p><strong>Kapanewon:</strong> ${safeText(props.kapanewon || '-')}</p>
      <p><strong>Luas:</strong> ${Number(props.luas_ha || 0).toFixed(2)} ha</p>
      <p><strong>Jumlah fasilitas:</strong> ${count} titik</p>
      <div class="popup-actions">
        <button class="popup-chip apply-village-filter" data-village="${safeText(props.kalurahan)}">
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

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '-';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function coordKey(lng, lat) {
  return `${Number(lng).toFixed(6)},${Number(lat).toFixed(6)}`;
}

function keyToLatLng(key) {
  const [lng, lat] = key.split(',').map(Number);
  return L.latLng(lat, lng);
}

function addGraphEdge(adjacency, aKey, bKey, distance) {
  if (!adjacency.has(aKey)) adjacency.set(aKey, []);
  if (!adjacency.has(bKey)) adjacency.set(bKey, []);
  adjacency.get(aKey).push({ to: bKey, weight: distance });
  adjacency.get(bKey).push({ to: aKey, weight: distance });
}

function buildRoadGraph(roadData) {
  const adjacency = new Map();
  const nodes = new Map();

  const addLine = coords => {
    for (let i = 0; i < coords.length; i++) {
      const [lng, lat] = coords[i];
      const key = coordKey(lng, lat);
      if (!nodes.has(key)) nodes.set(key, { key, lat, lng });
      if (i === 0) continue;
      const [plng, plat] = coords[i - 1];
      const prevKey = coordKey(plng, plat);
      const distance = haversineMeters(L.latLng(plat, plng), L.latLng(lat, lng));
      addGraphEdge(adjacency, prevKey, key, distance);
    }
  };

  (roadData.features || []).forEach(feature => {
    const g = feature.geometry;
    if (!g) return;
    if (g.type === 'LineString') addLine(g.coordinates);
    if (g.type === 'MultiLineString') g.coordinates.forEach(addLine);
  });

  return { adjacency, nodes: [...nodes.values()] };
}

function nearestGraphNode(latlng) {
  if (!roadGraph?.nodes?.length) return null;
  let best = null;
  let bestDistance = Infinity;
  roadGraph.nodes.forEach(node => {
    const d = haversineMeters(latlng, L.latLng(node.lat, node.lng));
    if (d < bestDistance) {
      bestDistance = d;
      best = node;
    }
  });
  return best ? { ...best, snapDistance: bestDistance } : null;
}

class MinHeap {
  constructor() { this.items = []; }
  push(item) {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.items[p].distance <= item.distance) break;
      this.items[i] = this.items[p];
      i = p;
    }
    this.items[i] = item;
  }
  pop() {
    if (!this.items.length) return null;
    const root = this.items[0];
    const last = this.items.pop();
    if (!this.items.length) return root;
    let i = 0;
    while (true) {
      const l = i * 2 + 1;
      const r = l + 1;
      if (l >= this.items.length) break;
      let c = l;
      if (r < this.items.length && this.items[r].distance < this.items[l].distance) c = r;
      if (this.items[c].distance >= last.distance) break;
      this.items[i] = this.items[c];
      i = c;
    }
    this.items[i] = last;
    return root;
  }
  get size() { return this.items.length; }
}

function dijkstra(startKey) {
  const dist = new Map([[startKey, 0]]);
  const prev = new Map();
  const heap = new MinHeap();
  heap.push({ key: startKey, distance: 0 });

  while (heap.size) {
    const current = heap.pop();
    if (current.distance !== dist.get(current.key)) continue;
    const edges = roadGraph.adjacency.get(current.key) || [];
    edges.forEach(edge => {
      const nextDistance = current.distance + edge.weight;
      if (nextDistance < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nextDistance);
        prev.set(edge.to, current.key);
        heap.push({ key: edge.to, distance: nextDistance });
      }
    });
  }
  return { dist, prev };
}

function reconstructPath(prev, startKey, endKey) {
  if (startKey === endKey) return [startKey];
  if (!prev.has(endKey)) return null;
  const path = [endKey];
  let cur = endKey;
  while (cur !== startKey) {
    cur = prev.get(cur);
    if (!cur) return null;
    path.push(cur);
  }
  return path.reverse();
}

function facilityLatLng(feature) {
  const [lng, lat] = feature.geometry.coordinates;
  return L.latLng(lat, lng);
}

function findFacilityById(id) {
  return facilities.find(f => String(f.properties?.id) === String(id));
}

function candidatesForAccess(category) {
  return facilities.filter(feature => {
    if (!feature.geometry || feature.geometry.type !== 'Point') return false;
    return category === 'Semua' || feature.properties?.kategori === category;
  });
}

function nearestByRoad(origin, candidates) {
  if (!roadGraph || !candidates.length) return null;
  const originNode = nearestGraphNode(origin);
  if (!originNode) return null;
  const { dist, prev } = dijkstra(originNode.key);

  let best = null;
  candidates.forEach(feature => {
    const targetLatLng = facilityLatLng(feature);
    const targetNode = nearestGraphNode(targetLatLng);
    if (!targetNode) return;
    const networkDistance = dist.get(targetNode.key);
    if (!Number.isFinite(networkDistance)) return;
    const total = originNode.snapDistance + networkDistance + targetNode.snapDistance;
    if (!best || total < best.totalDistance) {
      best = { feature, targetLatLng, targetNode, totalDistance: total, networkDistance, prev, originNode };
    }
  });
  return best;
}

function roadRouteToFacility(origin, feature) {
  if (!roadGraph) return null;
  const originNode = nearestGraphNode(origin);
  const targetLatLng = facilityLatLng(feature);
  const targetNode = nearestGraphNode(targetLatLng);
  if (!originNode || !targetNode) return null;
  const { dist, prev } = dijkstra(originNode.key);
  const networkDistance = dist.get(targetNode.key);
  if (!Number.isFinite(networkDistance)) return null;
  const pathKeys = reconstructPath(prev, originNode.key, targetNode.key);
  if (!pathKeys) return null;
  return {
    feature,
    originNode,
    targetNode,
    networkDistance,
    totalDistance: originNode.snapDistance + networkDistance + targetNode.snapDistance,
    latlngs: [origin, ...pathKeys.map(keyToLatLng), targetLatLng]
  };
}

function setOrigin(latlng, sourceLabel = 'Titik pilihan') {
  originLatLng = L.latLng(latlng.lat, latlng.lng);
  if (originMarker) analysisLayer.removeLayer(originMarker);
  originMarker = L.marker(originLatLng, {
    zIndexOffset: 1200,
    icon: L.divIcon({
      className: 'origin-marker',
      html: '<div class="origin-dot"><i class="fa-solid fa-location-crosshairs"></i></div>',
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    })
  }).addTo(analysisLayer).bindTooltip(`<strong>Origin</strong><br>${safeText(sourceLabel)}`, { direction: 'top', offset: [0, -14] });

  document.getElementById('originStatus').innerHTML = `<i class="fa-solid fa-circle-check"></i> ${safeText(sourceLabel)} dipilih`;
  document.getElementById('analyzeAccess').disabled = false;
  updateMapStatus('Origin siap dianalisis');
}

function updateMapStatus(text) {
  const el = document.getElementById('mapStatus');
  if (el) el.textContent = text;
}

function setManualOriginMode(enabled) {
  manualOriginMode = enabled;
  const btn = document.getElementById('markOrigin');
  if (enabled) {
    map.getContainer().classList.add('pick-origin-mode');
    btn.classList.add('active');
    btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Batal menandai';
    updateMapStatus('Klik lokasi pada peta untuk menetapkan origin');
  } else {
    map.getContainer().classList.remove('pick-origin-mode');
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fa-solid fa-location-dot"></i> Tandai di peta';
  }
}

function clearAnalysis({ keepOrigin = false } = {}) {
  if (bufferLayer) { analysisLayer.removeLayer(bufferLayer); bufferLayer = null; }
  if (routeLayer) { analysisLayer.removeLayer(routeLayer); routeLayer = null; }
  if (targetHalo) { analysisLayer.removeLayer(targetHalo); targetHalo = null; }
  lastAnalysis = null;
  document.getElementById('accessResults').classList.add('hidden');
  if (!keepOrigin) {
    if (originMarker) analysisLayer.removeLayer(originMarker);
    originMarker = null;
    originLatLng = null;
    document.getElementById('originStatus').innerHTML = '<i class="fa-regular fa-circle"></i> Belum ada origin';
    document.getElementById('analyzeAccess').disabled = true;
  }
  setManualOriginMode(false);
}

function displayRoute(route, fit = true) {
  if (routeLayer) analysisLayer.removeLayer(routeLayer);
  if (targetHalo) analysisLayer.removeLayer(targetHalo);

  routeLayer = L.polyline(route.latlngs, {
    color: '#0f766e',
    weight: 6,
    opacity: 0.9,
    lineJoin: 'round'
  }).addTo(analysisLayer);

  const target = facilityLatLng(route.feature);
  targetHalo = L.circleMarker(target, {
    radius: 15,
    color: '#0f766e',
    weight: 3,
    fillColor: '#ffffff',
    fillOpacity: 0.25
  }).addTo(analysisLayer);

  if (fit) {
    const group = L.featureGroup([routeLayer]);
    map.fitBounds(group.getBounds(), { padding: [60, 60], maxZoom: 16 });
  }
}

function runAccessibilityAnalysis() {
  if (!originLatLng) return;
  const category = document.getElementById('accessCategory').value;
  const radius = Number(document.getElementById('bufferRadius').value);
  const candidates = candidatesForAccess(category);

  if (bufferLayer) analysisLayer.removeLayer(bufferLayer);
  bufferLayer = L.circle(originLatLng, {
    radius,
    color: '#1f6f5f',
    weight: 2,
    dashArray: '7 7',
    fillColor: '#6fc0aa',
    fillOpacity: 0.12
  }).addTo(analysisLayer);

  const within = candidates
    .map(feature => ({ feature, distance: haversineMeters(originLatLng, facilityLatLng(feature)) }))
    .filter(item => item.distance <= radius)
    .sort((a, b) => a.distance - b.distance);

  const nearestRoad = nearestByRoad(originLatLng, candidates);
  let route = null;
  if (nearestRoad) {
    const pathKeys = reconstructPath(nearestRoad.prev, nearestRoad.originNode.key, nearestRoad.targetNode.key);
    if (pathKeys) {
      route = {
        feature: nearestRoad.feature,
        totalDistance: nearestRoad.totalDistance,
        networkDistance: nearestRoad.networkDistance,
        latlngs: [originLatLng, ...pathKeys.map(keyToLatLng), nearestRoad.targetLatLng]
      };
      displayRoute(route, false);
    }
  }

  const straightNearest = candidates
    .map(feature => ({ feature, distance: haversineMeters(originLatLng, facilityLatLng(feature)) }))
    .sort((a, b) => a.distance - b.distance)[0] || null;

  const nearestFeature = route?.feature || straightNearest?.feature || null;
  const nearestStraightDistance = nearestFeature ? haversineMeters(originLatLng, facilityLatLng(nearestFeature)) : null;

  document.getElementById('accessCount').textContent = within.length;
  document.getElementById('accessRadiusLabel').textContent = formatDistance(radius);
  document.getElementById('nearestName').textContent = nearestFeature?.properties?.nama || 'Tidak ada fasilitas';
  document.getElementById('nearestDistance').textContent = nearestStraightDistance != null ? formatDistance(nearestStraightDistance) : '-';
  document.getElementById('routeDistance').textContent = route ? formatDistance(route.totalDistance) : 'Tidak terhubung';
  document.getElementById('routeMode').textContent = route ? 'melalui jaringan jalan' : 'rute jaringan tidak tersedia';

  const list = document.getElementById('bufferFacilityList');
  list.innerHTML = within.length
    ? within.slice(0, 6).map((item, index) => `
        <button class="access-result-row" data-facility-id="${safeText(item.feature.properties.id)}">
          <span>${index + 1}</span>
          <div><strong>${safeText(item.feature.properties.nama)}</strong><small>${safeText(item.feature.properties.subkategori)} · ${formatDistance(item.distance)}</small></div>
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
        </button>`).join('')
    : '<p class="empty-result">Belum ada fasilitas kategori ini di dalam buffer.</p>';

  document.getElementById('accessResults').classList.remove('hidden');
  lastAnalysis = { category, radius, within, route };

  const bounds = bufferLayer.getBounds();
  if (routeLayer) bounds.extend(routeLayer.getBounds());
  map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });
  updateMapStatus(`${within.length} fasilitas dalam radius ${formatDistance(radius)} · ${category.toLowerCase()}`);
}

function routeToSpecificFacility(feature) {
  if (!originLatLng) {
    document.getElementById('accessPanel').classList.remove('hidden');
    document.getElementById('originStatus').classList.add('attention');
    setTimeout(() => document.getElementById('originStatus').classList.remove('attention'), 1200);
    updateMapStatus('Pilih origin terlebih dahulu untuk membuat rute');
    return;
  }
  const route = roadRouteToFacility(originLatLng, feature);
  if (!route) {
    updateMapStatus('Fasilitas tidak terhubung ke jaringan jalan yang tersedia');
    return;
  }
  displayRoute(route, true);
  document.getElementById('accessPanel').classList.remove('hidden');
  document.getElementById('nearestName').textContent = feature.properties.nama || '-';
  document.getElementById('nearestDistance').textContent = formatDistance(haversineMeters(originLatLng, facilityLatLng(feature)));
  document.getElementById('routeDistance').textContent = formatDistance(route.totalDistance);
  document.getElementById('routeMode').textContent = 'rute ke fasilitas yang dipilih';
  document.getElementById('accessResults').classList.remove('hidden');
  updateMapStatus(`Rute ke ${feature.properties.nama} · ${formatDistance(route.totalDistance)}`);
}

async function loadSpatialLayers() {
  const [boundaryRes, roadRes, facilityRes] = await Promise.all([
    fetch('data/batas_kalurahan.geojson'),
    fetch('data/jalan.geojson'),
    fetch('data/fasilitas.geojson')
  ]);

  if (!boundaryRes.ok || !roadRes.ok || !facilityRes.ok) {
    throw new Error('Salah satu data GeoJSON gagal dimuat.');
  }

  const boundaryData = await boundaryRes.json();
  const roadData = await roadRes.json();
  const facilityData = await facilityRes.json();

  facilities = facilityData.features || [];
  roadGraph = buildRoadGraph(roadData);

  boundaryLayer = L.geoJSON(boundaryData, {
    style: defaultBoundaryStyle,
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      villageLayers[p.kalurahan] = layer;
      layer.bindTooltip(`<strong>${safeText(p.kalurahan)}</strong><br>Kapanewon ${safeText(p.kapanewon)}`, { sticky: true });
      layer.bindPopup(villagePopupContent(p));
      layer.on('click', () => highlightBoundary(layer));
    }
  }).addTo(map);

  roadLayer = L.geoJSON(roadData, {
    style: { color: '#77827f', weight: 1.4, opacity: 0.55 },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      if (p.nama_jalan) layer.bindTooltip(safeText(p.nama_jalan), { sticky: true });
    }
  }).addTo(map);

  facilities.forEach(feature => {
    if (!feature.geometry || feature.geometry.type !== 'Point') return;
    const [lng, lat] = feature.geometry.coordinates;
    const marker = L.marker([lat, lng], {
      icon: createIcon(feature),
      riseOnHover: true,
      riseOffset: 500
    })
      .bindTooltip(`<strong>${safeText(feature.properties.nama)}</strong><br>${safeText(feature.properties.subkategori)}`, {
        direction: 'top',
        offset: [0, -30],
        opacity: 0.95
      })
      .bindPopup(popupContent(feature), { maxWidth: 340 });

    marker.featureData = feature;
    marker.addTo(map);
    markers.push(marker);
  });

  updateCounts();
  applyFilters();

  if (boundaryLayer) map.fitBounds(boundaryLayer.getBounds(), { padding: [20, 20] });

  L.control.layers(
    { OpenStreetMap: osm },
    { 'Batas Kalurahan': boundaryLayer, 'Jalan Kabupaten': roadLayer },
    { collapsed: false }
  ).addTo(map);
}

function updateCounts() {
  const counts = { Kesehatan: 0, Pendidikan: 0, Pemerintahan: 0, Ekonomi: 0 };
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
    const keywordMatch = !keyword ||
      (p.nama || '').toLowerCase().includes(keyword) ||
      (p.subkategori || '').toLowerCase().includes(keyword) ||
      (p.kalurahan || '').toLowerCase().includes(keyword);
    const shouldShow = categoryMatch && villageMatch && keywordMatch;
    if (shouldShow) {
      if (!map.hasLayer(marker)) marker.addTo(map);
      visible++;
    } else if (map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  });

  if (village !== 'Semua') focusOnVillage(village, false);
  else clearBoundaryHighlight();

  document.getElementById('visibleFacilities').textContent = visible;
  const villageText = village === 'Semua' ? 'semua kalurahan' : village;
  updateMapStatus(`${visible} fasilitas · ${villageText}`);
}

// Main filters
document.querySelectorAll('.category-filter').forEach(el => el.addEventListener('change', applyFilters));
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
  btn.addEventListener('click', () => focusOnVillage(btn.dataset.village, true));
});

// Accessibility panel
const accessPanel = document.getElementById('accessPanel');
document.getElementById('accessButton').addEventListener('click', () => accessPanel.classList.remove('hidden'));
document.getElementById('closeAccessPanel').addEventListener('click', () => accessPanel.classList.add('hidden'));
document.getElementById('markOrigin').addEventListener('click', () => setManualOriginMode(!manualOriginMode));
document.getElementById('analyzeAccess').addEventListener('click', runAccessibilityAnalysis);
document.getElementById('clearAnalysis').addEventListener('click', () => {
  clearAnalysis();
  updateMapStatus(`${document.getElementById('visibleFacilities').textContent} fasilitas · semua analisis dibersihkan`);
});

document.getElementById('myLocation').addEventListener('click', () => {
  if (!navigator.geolocation) {
    updateMapStatus('Browser tidak mendukung geolokasi');
    return;
  }
  const btn = document.getElementById('myLocation');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Membaca lokasi...';
  navigator.geolocation.getCurrentPosition(
    pos => {
      btn.disabled = false;
      btn.innerHTML = old;
      setOrigin(L.latLng(pos.coords.latitude, pos.coords.longitude), 'Lokasi saya');
      map.setView(originLatLng, 15);
      accessPanel.classList.remove('hidden');
    },
    err => {
      btn.disabled = false;
      btn.innerHTML = old;
      const msg = err.code === 1 ? 'Izin lokasi ditolak browser' : 'Lokasi belum berhasil dibaca';
      updateMapStatus(msg);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
});

map.on('click', e => {
  if (!manualOriginMode) return;
  setOrigin(e.latlng, 'Titik yang ditandai');
  setManualOriginMode(false);
  accessPanel.classList.remove('hidden');
});

const sidebar = document.getElementById('sidebar');
document.getElementById('sidebarToggle').addEventListener('click', () => sidebar.classList.toggle('open'));

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

  popupEl.querySelectorAll('.route-facility-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const feature = findFacilityById(btn.dataset.facilityId);
      if (feature) routeToSpecificFacility(feature);
      map.closePopup();
    });
  });
});

document.getElementById('bufferFacilityList').addEventListener('click', e => {
  const row = e.target.closest('[data-facility-id]');
  if (!row) return;
  const feature = findFacilityById(row.dataset.facilityId);
  if (!feature) return;
  const marker = markers.find(m => String(m.featureData.properties.id) === String(row.dataset.facilityId));
  if (marker) {
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16));
    marker.openPopup();
  }
});

loadSpatialLayers().catch(err => {
  console.error(err);
  updateMapStatus('Gagal memuat data. Jalankan melalui Live Server atau GitHub Pages.');
});
