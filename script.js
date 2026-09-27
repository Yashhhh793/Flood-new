const API = "";

let map;
let markersLayer;
let selectedMarker = null;
let dashboardMarkers = [];

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[c]));
}

function riskColor(level) {
  return ({
    LOW: "#22c55e",
    MODERATE: "#eab308",
    HIGH: "#f97316",
    CRITICAL: "#ef4444"
  })[level] || "#8ea0c2";
}

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([30.5546, 79.5644], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  // Map click = select exact point.
  map.on("click", (e) => {
    setSelectedLocation(e.latlng.lat, e.latlng.lng, "Map selected location", true);
  });
}

function setSelectedLocation(lat, lon, name = "Selected location", moveMap = true) {
  lat = Number(lat);
  lon = Number(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    alert("Please enter valid latitude and longitude.");
    return;
  }

  $("lat-input").value = lat.toFixed(6);
  $("lon-input").value = lon.toFixed(6);
  if (!$("name-input").value || $("name-input").value === "Map selected location") {
    $("name-input").value = name;
  }

  if (selectedMarker) map.removeLayer(selectedMarker);
  selectedMarker = L.marker([lat, lon], { draggable: true }).addTo(map);
  selectedMarker.bindTooltip("Selected location", { permanent: false });
  selectedMarker.on("dragend", () => {
    const p = selectedMarker.getLatLng();
    setSelectedLocation(p.lat, p.lng, $("name-input").value || "Map selected location", false);
  });

  if (moveMap) map.setView([lat, lon], Math.max(map.getZoom(), 12));
}

async function predictSelected() {
  const lat = parseFloat($("lat-input").value);
  const lon = parseFloat($("lon-input").value);
  const name = ($("name-input").value || "Custom location").trim();

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    alert("Select a location from the map or enter valid latitude and longitude.");
    return;
  }

  const btn = $("check-btn");
  btn.disabled = true;
  btn.textContent = "Checking…";

  try {
    const url = `${API}/api/predict?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&name=${encodeURIComponent(name)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    showSelectedResult(data);
    setSelectedLocation(data.lat, data.lon, data.name, true);
  } catch (err) {
    console.error(err);
    alert("Could not fetch prediction. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Predict Risk";
  }
}

function showSelectedResult(data) {
  const color = riskColor(data.risk_level);
  const inputs = data.inputs || {};
  const panel = $("detail-panel");

  panel.innerHTML = `
    <span class="close-x" onclick="this.parentElement.classList.add('hidden')">×</span>
    <h3>${esc(data.name)}</h3>
    <div class="risk-big" style="color:${color}">${esc(data.risk_level)}</div>
    <div class="row"><span>Probability</span><strong>${Math.round((data.probabilities?.[data.risk_level] || 0) * 100)}%</strong></div>
    <div class="row"><span>1h Rainfall</span><strong>${inputs.rainfall_1h_mm ?? "—"} mm</strong></div>
    <div class="row"><span>24h Rainfall</span><strong>${inputs.rainfall_24h_mm ?? "—"} mm</strong></div>
    <div class="row"><span>Soil Moisture</span><strong>${inputs.soil_moisture_m3m3 ?? "—"}</strong></div>
    <div class="row"><span>Elevation</span><strong>${inputs.elevation_m ?? "—"} m</strong></div>
    <div class="row"><span>Slope</span><strong>${inputs.slope_deg ?? "—"}°</strong></div>
    <div class="action-box"><strong>Recommended action</strong><br>${esc(data.recommended_action || "Continue monitoring.")}</div>
    <div class="src">Weather: ${esc(data.data_sources?.weather || "—")}<br>Terrain: ${esc(data.data_sources?.terrain || "—")}</div>
  `;
  panel.classList.remove("hidden");

  const p = [data.lat, data.lon];
  if (selectedMarker) selectedMarker.setLatLng(p);
  else selectedMarker = L.marker(p, { draggable: true }).addTo(map);
  selectedMarker.bindPopup(`<strong>${esc(data.name)}</strong><br>${esc(data.risk_level)} risk`).openPopup();
  selectedMarker.off("dragend").on("dragend", () => {
    const q = selectedMarker.getLatLng();
    setSelectedLocation(q.lat, q.lng, $("name-input").value || "Selected location", false);
  });
  map.setView(p, Math.max(map.getZoom(), 12));
}

function renderSummary(locations) {
  const counts = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
  locations.forEach(x => counts[x.risk_level] = (counts[x.risk_level] || 0) + 1);
  $("summary-cards").innerHTML = Object.entries(counts).map(([risk, count]) => `
    <div class="summary-card" style="border-top:3px solid ${riskColor(risk)}">
      <div class="count">${count}</div><div class="label">${risk}</div>
    </div>`).join("");
}

function renderLocations(locations) {
  $("location-list").innerHTML = locations.map(loc => `
    <div class="loc-card" data-id="${esc(loc.id)}" style="border-left-color:${riskColor(loc.risk_level)}">
      <div class="name">${esc(loc.name)}</div>
      <div class="meta"><span>${Number(loc.lat).toFixed(3)}, ${Number(loc.lon).toFixed(3)}</span>
      <span class="risk-tag" style="background:${riskColor(loc.risk_level)}">${esc(loc.risk_level)}</span></div>
    </div>
  `).join("");

  document.querySelectorAll(".loc-card").forEach((card, i) => {
    card.addEventListener("click", () => {
      const loc = locations[i];
      $("lat-input").value = loc.lat;
      $("lon-input").value = loc.lon;
      $("name-input").value = loc.name;
      setSelectedLocation(loc.lat, loc.lon, loc.name, true);
      showSelectedResult(loc);
    });
  });
}

function renderMapMarkers(locations) {
  markersLayer.clearLayers();
  dashboardMarkers = [];
  locations.forEach(loc => {
    const marker = L.circleMarker([loc.lat, loc.lon], {
      radius: 8,
      color: "#ffffff",
      weight: 1.5,
      fillColor: riskColor(loc.risk_level),
      fillOpacity: 0.9
    }).addTo(markersLayer);
    marker.bindPopup(`<strong>${esc(loc.name)}</strong><br><b style="color:${riskColor(loc.risk_level)}">${esc(loc.risk_level)} risk</b>`);
    marker.on("click", () => {
      $("lat-input").value = loc.lat;
      $("lon-input").value = loc.lon;
      $("name-input").value = loc.name;
      showSelectedResult(loc);
    });
    dashboardMarkers.push(marker);
  });
}

async function loadDashboard() {
  try {
    $("last-updated").textContent = "Loading…";
    const res = await fetch(`${API}/api/dashboard`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const locations = data.locations || [];
    renderSummary(locations);
    renderLocations(locations);
    renderMapMarkers(locations);
    $("last-updated").textContent = `Updated ${new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}`;
  } catch (err) {
    console.error(err);
    $("last-updated").textContent = "Update failed";
  }
}

async function searchPlace() {
  const query = ($("place-search").value || "").trim();
  if (!query) return;

  const btn = $("search-place-btn");
  btn.disabled = true;
  btn.textContent = "Searching…";
  try {
    // Nominatim is used only for geocoding the place name; prediction still comes from our API.
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error("Geocoding failed");
    const results = await res.json();
    if (!results.length) {
      alert("Location not found. Try a city, village, district or landmark name.");
      return;
    }
    const place = results[0];
    const displayName = place.display_name.split(",").slice(0, 2).join(", ");
    $("name-input").value = displayName;
    setSelectedLocation(Number(place.lat), Number(place.lon), displayName, true);
  } catch (err) {
    console.error(err);
    alert("Location search failed. You can select the point directly on the map.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Search";
  }
}

function bindUI() {
  $("check-btn").addEventListener("click", predictSelected);
  $("refresh-btn").addEventListener("click", loadDashboard);
  $("search-place-btn").addEventListener("click", searchPlace);
  $("place-search").addEventListener("keydown", e => {
    if (e.key === "Enter") searchPlace();
  });

  // Enter in coordinate/name fields also predicts.
  ["lat-input", "lon-input", "name-input"].forEach(id => {
    $(id).addEventListener("keydown", e => {
      if (e.key === "Enter") predictSelected();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  bindUI();
  loadDashboard();
});
