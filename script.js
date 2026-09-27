const API = "";

let map;
let markersLayer;
let selectedMarker = null;
let dashboardMarkers = [];

const $ = (id) => document.getElementById(id);


/* =========================================================
   HELPERS
   ========================================================= */

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
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


/* =========================================================
   INDIAN STATES + UTs
   ========================================================= */

const indianStates = [

  { name: "Andhra Pradesh", lat: 15.9129, lon: 79.7400 },
  { name: "Arunachal Pradesh", lat: 28.2180, lon: 94.7278 },
  { name: "Assam", lat: 26.2006, lon: 92.9376 },
  { name: "Bihar", lat: 25.0961, lon: 85.3131 },
  { name: "Chhattisgarh", lat: 21.2787, lon: 81.8661 },
  { name: "Goa", lat: 15.2993, lon: 74.1240 },
  { name: "Gujarat", lat: 22.2587, lon: 71.1924 },
  { name: "Haryana", lat: 29.0588, lon: 76.0856 },
  { name: "Himachal Pradesh", lat: 31.1048, lon: 77.1734 },
  { name: "Jharkhand", lat: 23.6102, lon: 85.2799 },
  { name: "Karnataka", lat: 15.3173, lon: 75.7139 },
  { name: "Kerala", lat: 10.8505, lon: 76.2711 },
  { name: "Madhya Pradesh", lat: 22.9734, lon: 78.6569 },
  { name: "Maharashtra", lat: 19.7515, lon: 75.7139 },
  { name: "Manipur", lat: 24.6637, lon: 93.9063 },
  { name: "Meghalaya", lat: 25.4670, lon: 91.3662 },
  { name: "Mizoram", lat: 23.1645, lon: 92.9376 },
  { name: "Nagaland", lat: 26.1584, lon: 94.5624 },
  { name: "Odisha", lat: 20.9517, lon: 85.0985 },
  { name: "Punjab", lat: 31.1471, lon: 75.3412 },
  { name: "Rajasthan", lat: 27.0238, lon: 74.2179 },
  { name: "Sikkim", lat: 27.5330, lon: 88.5122 },
  { name: "Tamil Nadu", lat: 11.1271, lon: 78.6569 },
  { name: "Telangana", lat: 18.1124, lon: 79.0193 },
  { name: "Tripura", lat: 23.9408, lon: 91.9882 },
  { name: "Uttar Pradesh", lat: 26.8467, lon: 80.9462 },
  { name: "Uttarakhand", lat: 30.0668, lon: 79.0193 },
  { name: "West Bengal", lat: 22.9868, lon: 87.8550 },

  // Union Territories

  { name: "Delhi", lat: 28.7041, lon: 77.1025 },
  { name: "Jammu and Kashmir", lat: 33.7782, lon: 76.5762 },
  { name: "Ladakh", lat: 34.1526, lon: 77.5771 },
  { name: "Puducherry", lat: 11.9416, lon: 79.8083 },
  { name: "Chandigarh", lat: 30.7333, lon: 76.7794 },
  { name: "Andaman and Nicobar Islands", lat: 11.7401, lon: 92.6586 },
  { name: "Dadra and Nagar Haveli and Daman and Diu", lat: 20.1809, lon: 73.0169 },
  { name: "Lakshadweep", lat: 10.5667, lon: 72.6417 }

];


/* =========================================================
   MAP INITIALIZATION
   ========================================================= */

function initMap() {

  map = L.map("map", {
    zoomControl: true
  }).setView(
    [30.5546, 79.5644],
    7
  );


  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }
  ).addTo(map);


  markersLayer =
    L.layerGroup().addTo(map);


  /*
     MAP CLICK

     User clicks anywhere on map
     ↓
     latitude + longitude
     ↓
     reverse geocoding
     ↓
     location name
  */

  map.on(
    "click",
    async (e) => {

      const lat =
        e.latlng.lat;

      const lon =
        e.latlng.lng;


      const name =
        await reverseGeocode(
          lat,
          lon
        );


      setSelectedLocation(
        lat,
        lon,
        name,
        true
      );

    }
  );
}


/* =========================================================
   SELECT LOCATION
   ========================================================= */

function setSelectedLocation(
  lat,
  lon,
  name = "Selected location",
  moveMap = true
) {

  lat = Number(lat);
  lon = Number(lon);


  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {

    alert(
      "Invalid location coordinates."
    );

    return;

  }


  /*
     FILL LOCATION NAME
  */

  if ($("location-input")) {

    $("location-input").value =
      name;

  }


  /*
     FILL LATITUDE
  */

  $("lat-input").value =
    lat.toFixed(6);


  /*
     FILL LONGITUDE
  */

  $("lon-input").value =
    lon.toFixed(6);


  /*
     SELECTED LOCATION BOX
  */

  if ($("selected-location-box")) {

    $("selected-location-box").innerHTML = `
      <strong>📍 ${esc(name)}</strong><br>
      Latitude: ${lat.toFixed(6)}<br>
      Longitude: ${lon.toFixed(6)}
    `;

  }


  /*
     ENABLE PREDICT BUTTON
  */

  $("check-btn").disabled =
    false;


  /*
     REMOVE OLD SELECTED MARKER
  */

  if (selectedMarker) {

    map.removeLayer(
      selectedMarker
    );

  }


  /*
     CREATE NEW SELECTED MARKER
  */

  selectedMarker =
    L.marker(
      [lat, lon],
      {
        draggable: true
      }
    ).addTo(map);


  selectedMarker.bindTooltip(
    name,
    {
      direction: "top"
    }
  );


  /*
     DRAG MARKER
  */

  selectedMarker.on(
    "dragend",
    async () => {

      const p =
        selectedMarker.getLatLng();


      const newName =
        await reverseGeocode(
          p.lat,
          p.lng
        );


      setSelectedLocation(
        p.lat,
        p.lng,
        newName,
        false
      );

    }
  );


  /*
     MOVE MAP
  */

  if (moveMap) {

    map.setView(
      [lat, lon],
      Math.max(
        map.getZoom(),
        9
      )
    );

  }

}


/* =========================================================
   STATE SEARCH
   ========================================================= */

function showStateSuggestions(
  query
) {

  const box =
    $("location-suggestions");


  if (!box) return;


  query =
    query
      .trim()
      .toLowerCase();


  if (!query) {

    box.classList.add(
      "hidden"
    );

    return;

  }


  const matches =
    indianStates
      .filter(
        state =>
          state.name
            .toLowerCase()
            .includes(query)
      )
      .slice(0, 10);


  if (!matches.length) {

    box.innerHTML = `
      <div class="location-suggestion">
        No state found
      </div>
    `;

    box.classList.remove(
      "hidden"
    );

    return;

  }


  box.innerHTML =
    matches
      .map(
        state => `

          <div
            class="location-suggestion"
            data-name="${esc(state.name)}"
            data-lat="${state.lat}"
            data-lon="${state.lon}"
          >

            <div class="location-suggestion-title">
              🇮🇳 ${esc(state.name)}
            </div>

            <div class="location-suggestion-coords">
              ${state.lat.toFixed(4)},
              ${state.lon.toFixed(4)}
            </div>

          </div>

        `
      )
      .join("");


  /*
     CLICK SUGGESTION
  */

  box
    .querySelectorAll(
      ".location-suggestion[data-name]"
    )
    .forEach(
      element => {

        element.addEventListener(
          "click",
          () => {

            const name =
              element.dataset.name;

            const lat =
              Number(
                element.dataset.lat
              );

            const lon =
              Number(
                element.dataset.lon
              );


            setSelectedLocation(
              lat,
              lon,
              name,
              true
            );

          }
        );

      }
    );


  box.classList.remove(
    "hidden"
  );

}


/* =========================================================
   LOCATION INPUT
   ========================================================= */

function bindLocationSearch() {

  const input =
    $("location-input");


  if (!input) return;


  input.addEventListener(
    "input",
    () => {

      showStateSuggestions(
        input.value
      );

    }
  );


  input.addEventListener(
    "focus",
    () => {

      if (input.value.trim()) {

        showStateSuggestions(
          input.value
        );

      }

    }
  );

}


/* =========================================================
   REVERSE GEOCODING
   MAP → LOCATION NAME
   ========================================================= */

async function reverseGeocode(
  lat,
  lon
) {

  try {

    const url =
      "https://nominatim.openstreetmap.org/reverse" +
      `?format=jsonv2` +
      `&lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}` +
      `&zoom=10` +
      `&addressdetails=1`;


    const response =
      await fetch(
        url,
        {
          headers: {
            "Accept":
              "application/json"
          }
        }
      );


    if (!response.ok) {

      throw new Error(
        "Reverse geocoding failed"
      );

    }


    const data =
      await response.json();


    const address =
      data.address || {};


    /*
       Prefer:

       State
       ↓
       City
       ↓
       Town
       ↓
       Village
    */

    return (
      address.state ||
      address.city ||
      address.town ||
      address.village ||
      data.display_name ||
      "Selected map location"
    );

  }

  catch (error) {

    console.error(
      "Reverse geocoding error:",
      error
    );


    return `Map Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;

  }

}


/* =========================================================
   MAP SELECT BUTTON
   ========================================================= */

function bindMapSelectButton() {

  const button =
    $("map-select-btn");


  if (!button) return;


  button.addEventListener(
    "click",
    () => {

      alert(
        "Now click anywhere on the map to select a location."
      );


      map.getContainer().style.cursor =
        "crosshair";


      setTimeout(
        () => {

          map.getContainer().style.cursor =
            "";

        },
        10000
      );

    }
  );

}


/* =========================================================
   CLEAR LOCATION
   ========================================================= */

function bindClearButton() {

  const button =
    $("clear-location-btn");


  if (!button) return;


  button.addEventListener(
    "click",
    () => {

      if ($("location-input"))
        $("location-input").value = "";


      $("lat-input").value = "";

      $("lon-input").value = "";


      if ($("selected-location-box")) {

        $("selected-location-box").innerHTML =
          "No location selected";

      }


      $("check-btn").disabled =
        true;


      if (selectedMarker) {

        map.removeLayer(
          selectedMarker
        );

        selectedMarker = null;

      }

    }
  );

}


/* =========================================================
   PREDICT SELECTED LOCATION
   ========================================================= */

async function predictSelected() {

  const lat =
    parseFloat(
      $("lat-input").value
    );


  const lon =
    parseFloat(
      $("lon-input").value
    );


  const name =
    (
      $("location-input")?.value ||
      "Custom location"
    ).trim();


  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {

    alert(
      "Please select a location first."
    );

    return;

  }


  const btn =
    $("check-btn");


  btn.disabled = true;

  btn.textContent =
    "Checking…";


  try {

    const url =
      `${API}/api/predict` +
      `?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}` +
      `&name=${encodeURIComponent(name)}`;


    const res =
      await fetch(url);


    if (!res.ok) {

      throw new Error(
        await res.text()
      );

    }


    const data =
      await res.json();


    showSelectedResult(
      data
    );


    setSelectedLocation(
      data.lat,
      data.lon,
      data.name,
      true
    );

  }

  catch (err) {

    console.error(err);

    alert(
      "Could not fetch prediction. Please try again."
    );

  }

  finally {

    btn.disabled = false;

    btn.textContent =
      "Predict Risk";

  }

}


/* =========================================================
   SHOW PREDICTION RESULT
   ========================================================= */

function showSelectedResult(
  data
) {

  const color =
    riskColor(
      data.risk_level
    );


  const inputs =
    data.inputs || {};


  const panel =
    $("detail-panel");


  panel.innerHTML = `

    <span
      class="close-x"
      onclick="this.parentElement.classList.add('hidden')"
    >
      ×
    </span>

    <h3>
      ${esc(data.name)}
    </h3>

    <div
      class="risk-big"
      style="color:${color}"
    >
      ${esc(data.risk_level)}
    </div>

    <div class="row">
      <span>Probability</span>
      <strong>
        ${Math.round(
          (data.probabilities?.[data.risk_level] || 0) * 100
        )}%
      </strong>
    </div>

    <div class="row">
      <span>1h Rainfall</span>
      <strong>
        ${inputs.rainfall_1h_mm ?? "—"} mm
      </strong>
    </div>

    <div class="row">
      <span>24h Rainfall</span>
      <strong>
        ${inputs.rainfall_24h_mm ?? "—"} mm
      </strong>
    </div>

    <div class="row">
      <span>Soil Moisture</span>
      <strong>
        ${inputs.soil_moisture_m3m3 ?? "—"}
      </strong>
    </div>

    <div class="row">
      <span>Elevation</span>
      <strong>
        ${inputs.elevation_m ?? "—"} m
      </strong>
    </div>

    <div class="row">
      <span>Slope</span>
      <strong>
        ${inputs.slope_deg ?? "—"}°
      </strong>
    </div>

    <div class="action-box">
      <strong>Recommended action</strong>
      <br>
      ${esc(
        data.recommended_action ||
        "Continue monitoring."
      )}
    </div>

    <div class="src">
      Weather:
      ${esc(
        data.data_sources?.weather ||
        "—"
      )}
      <br>

      Terrain:
      ${esc(
        data.data_sources?.terrain ||
        "—"
      )}
    </div>

  `;


  panel.classList.remove(
    "hidden"
  );


  const p =
    [
      data.lat,
      data.lon
    ];


  if (selectedMarker) {

    selectedMarker.setLatLng(
      p
    );

  }

  else {

    selectedMarker =
      L.marker(
        p,
        {
          draggable: true
        }
      ).addTo(map);

  }


  selectedMarker
    .bindPopup(
      `<strong>${esc(data.name)}</strong>
       <br>
       ${esc(data.risk_level)} risk`
    )
    .openPopup();


  selectedMarker
    .off("dragend")
    .on(
      "dragend",
      async () => {

        const q =
          selectedMarker.getLatLng();


        const newName =
          await reverseGeocode(
            q.lat,
            q.lng
          );


        setSelectedLocation(
          q.lat,
          q.lng,
          newName,
          false
        );

      }
    );


  map.setView(
    p,
    Math.max(
      map.getZoom(),
      12
    )
  );

}


/* =========================================================
   DASHBOARD SUMMARY
   ========================================================= */

function renderSummary(
  locations
) {

  const counts = {
    LOW: 0,
    MODERATE: 0,
    HIGH: 0,
    CRITICAL: 0
  };


  locations.forEach(
    x => {

      counts[x.risk_level] =
        (
          counts[x.risk_level] ||
          0
        ) + 1;

    }
  );


  $("summary-cards").innerHTML =
    Object.entries(counts)
      .map(
        ([risk, count]) => `

          <div
            class="summary-card"
            style="border-top:3px solid ${riskColor(risk)}"
          >

            <div class="count">
              ${count}
            </div>

            <div class="label">
              ${risk}
            </div>

          </div>

        `
      )
      .join("");

}


/* =========================================================
   DASHBOARD LOCATION LIST
   ========================================================= */

function renderLocations(
  locations
) {

  $("location-list").innerHTML =
    locations
      .map(
        loc => `

          <div
            class="loc-card"
            data-id="${esc(loc.id)}"
            style="border-left-color:${riskColor(loc.risk_level)}"
          >

            <div class="name">
              ${esc(loc.name)}
            </div>

            <div class="meta">

              <span>
                ${Number(loc.lat).toFixed(3)},
                ${Number(loc.lon).toFixed(3)}
              </span>

              <span
                class="risk-tag"
                style="background:${riskColor(loc.risk_level)}"
              >
                ${esc(loc.risk_level)}
              </span>

            </div>

          </div>

        `
      )
      .join("");


  document
    .querySelectorAll(".loc-card")
    .forEach(
      (card, i) => {

        card.addEventListener(
          "click",
          () => {

            const loc =
              locations[i];


            setSelectedLocation(
              loc.lat,
              loc.lon,
              loc.name,
              true
            );


            showSelectedResult(
              loc
            );

          }
        );

      }
    );

}


/* =========================================================
   DASHBOARD MAP MARKERS
   ========================================================= */

function renderMapMarkers(
  locations
) {

  markersLayer.clearLayers();

  dashboardMarkers = [];


  locations.forEach(
    loc => {

      const marker =
        L.circleMarker(
          [
            loc.lat,
            loc.lon
          ],
          {
            radius: 8,
            color: "#ffffff",
            weight: 1.5,
            fillColor:
              riskColor(
                loc.risk_level
              ),
            fillOpacity: 0.9
          }
        )
        .addTo(
          markersLayer
        );


      marker.bindPopup(
        `<strong>
          ${esc(loc.name)}
        </strong>
        <br>
        <b
          style="color:${riskColor(loc.risk_level)}"
        >
          ${esc(loc.risk_level)} risk
        </b>`
      );


      marker.on(
        "click",
        () => {

          setSelectedLocation(
            loc.lat,
            loc.lon,
            loc.name,
            true
          );


          showSelectedResult(
            loc
          );

        }
      );


      dashboardMarkers.push(
        marker
      );

    }
  );

}


/* =========================================================
   LOAD DASHBOARD
   ========================================================= */

async function loadDashboard() {

  try {

    $("last-updated").textContent =
      "Loading…";


    const res =
      await fetch(
        `${API}/api/dashboard`
      );


    if (!res.ok) {

      throw new Error(
        await res.text()
      );

    }


    const data =
      await res.json();


    const locations =
      data.locations || [];


    renderSummary(
      locations
    );


    renderLocations(
      locations
    );


    renderMapMarkers(
      locations
    );


    $("last-updated").textContent =
      `Updated ${
        new Date().toLocaleTimeString(
          [],
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        )
      }`;

  }

  catch (err) {

    console.error(err);

    $("last-updated").textContent =
      "Update failed";

  }

}


/* =========================================================
   BIND UI
   ========================================================= */

function bindUI() {

  /*
     Predict Risk
  */

  $("check-btn")
    .addEventListener(
      "click",
      predictSelected
    );


  /*
     Refresh
  */

  $("refresh-btn")
    .addEventListener(
      "click",
      loadDashboard
    );


  /*
     State/location search
  */

  bindLocationSearch();


  /*
     Map select
  */

  bindMapSelectButton();


  /*
     Clear
  */

  bindClearButton();


  /*
     Close suggestions when
     clicking outside
  */

  document.addEventListener(
    "click",
    (event) => {

      if (
        !event.target.closest(
          ".location-search-wrapper"
        )
      ) {

        const box =
          $("location-suggestions");


        if (box) {

          box.classList.add(
            "hidden"
          );

        }

      }

    }
  );

}


/* =========================================================
   START APP
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    initMap();

    bindUI();

    loadDashboard();

  }
);
