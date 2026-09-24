
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

const categoryClass = {
  "Kesehatan": "marker-health",
  "Pendidikan": "marker-education",
  "Pemerintahan": "marker-government",
  "Ekonomi": "marker-economy"
};

let facilities = [];
const markers = [];
let boundaryLayer = null;
let roadLayer = null;

function createIcon(category) {
  return L.divIcon({
    className: `custom-marker ${categoryClass[category] || ""}`,
    iconSize: [18, 18]
  });
}

function popupContent(feature) {
  const p = feature.properties;
  return `
    <div class="popup-card">
      <span>${p.kategori || "-"}</span>
      <h3>${p.nama || "Tanpa nama"}</h3>
      <p><strong>Subkategori:</strong> ${p.subkategori || "-"}</p>
      <p><strong>Kalurahan:</strong> ${p.kalurahan || "-"}</p>
      ${p.alamat ? `<p><strong>Alamat:</strong> ${p.alamat}</p>` : ""}
      <p><strong>Tahun data:</strong> ${p.tahun || "-"}</p>
      <p><strong>Sumber:</strong> ${p.sumber || "-"}</p>
    </div>
  `;
}

function selectedCategories() {
  return [...document.querySelectorAll(".category-filter:checked")].map(el => el.value);
}

async function loadSpatialLayers() {
  const [boundaryRes, roadRes, facilityRes] = await Promise.all([
    fetch("data/batas_kalurahan.geojson"),
    fetch("data/jalan.geojson"),
    fetch("data/fasilitas.geojson")
  ]);

  const boundaryData = await boundaryRes.json();
  const roadData = await roadRes.json();
  const facilityData = await facilityRes.json();

  boundaryLayer = L.geoJSON(boundaryData, {
    style: {
      color: "#1f6f5f",
      weight: 2,
      fillColor: "#8fc8b8",
      fillOpacity: 0.06
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      layer.bindTooltip(
        `<strong>${p.kalurahan}</strong><br>Kapanewon ${p.kapanewon}`,
        { sticky: true }
      );
    }
  }).addTo(map);

  roadLayer = L.geoJSON(roadData, {
    style: {
      color: "#77827f",
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

  facilities = facilityData.features || [];

  facilities.forEach(feature => {
    if (!feature.geometry || feature.geometry.type !== "Point") return;
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
    { "OpenStreetMap": osm },
    {
      "Batas Kalurahan": boundaryLayer,
      "Jalan Kabupaten": roadLayer
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

  document.getElementById("count-health").textContent = counts.Kesehatan;
  document.getElementById("count-education").textContent = counts.Pendidikan;
  document.getElementById("count-government").textContent = counts.Pemerintahan;
  document.getElementById("count-economy").textContent = counts.Ekonomi;
  document.getElementById("totalFacilities").textContent = facilities.length;
}

function applyFilters() {
  const categories = selectedCategories();
  const village = document.getElementById("villageFilter").value;
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();

  let visible = 0;

  markers.forEach(marker => {
    const p = marker.featureData.properties;

    const categoryMatch = categories.includes(p.kategori);
    const villageMatch = village === "Semua" || p.kalurahan === village;
    const keywordMatch =
      !keyword ||
      (p.nama || "").toLowerCase().includes(keyword) ||
      (p.subkategori || "").toLowerCase().includes(keyword) ||
      (p.kalurahan || "").toLowerCase().includes(keyword);

    const shouldShow = categoryMatch && villageMatch && keywordMatch;

    if (shouldShow) {
      if (!map.hasLayer(marker)) marker.addTo(map);
      visible++;
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    }
  });

  document.getElementById("visibleFacilities").textContent = visible;

  const villageText = village === "Semua" ? "semua kalurahan" : village;
  document.getElementById("mapStatus").textContent =
    `${visible} fasilitas · ${villageText}`;
}

document.querySelectorAll(".category-filter").forEach(el => {
  el.addEventListener("change", applyFilters);
});

document.getElementById("villageFilter").addEventListener("change", applyFilters);
document.getElementById("searchInput").addEventListener("input", applyFilters);

document.getElementById("resetFilters").addEventListener("click", () => {
  document.querySelectorAll(".category-filter").forEach(el => el.checked = true);
  document.getElementById("villageFilter").value = "Semua";
  document.getElementById("searchInput").value = "";
  applyFilters();
});

const accessPanel = document.getElementById("accessPanel");

document.getElementById("accessButton").addEventListener("click", () => {
  accessPanel.classList.remove("hidden");
});

document.getElementById("closeAccessPanel").addEventListener("click", () => {
  accessPanel.classList.add("hidden");
});

const sidebar = document.getElementById("sidebar");
document.getElementById("sidebarToggle").addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

loadSpatialLayers().catch(err => {
  console.error(err);
  document.getElementById("mapStatus").textContent = "Gagal memuat data. Jalankan melalui Live Server.";
});
