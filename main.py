
from pathlib import Path
import json
import math
import os

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent
DATA = BASE / "rainfall_tel_hr_uttarakhand_uk_2021_2025.csv"
MODEL = BASE / "flashguard_rainfall_anomaly_model.joblib"
META = BASE / "model_metadata.json"
PCTS = BASE / "rainfall_percentiles.json"
EVENTS = BASE / "historical_flash_flood_events_uttarakhand.csv"

FEATURES = [
    "rainfall_1h_mm", "rainfall_3h_mm", "rainfall_6h_mm",
    "rainfall_12h_mm", "rainfall_24h_mm", "rainfall_72h_mm"
]

app = FastAPI(
    title="FLASHGUARD — Hyper-Local Flash Flood Early Warning",
    version="2.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

df = None
model = None
meta = {}
pcts = {}
station_latest = None
station_coords = None

def load_data():
    global df, station_latest, station_coords, model, meta, pcts
    d = pd.read_csv(DATA)
    d.columns = [str(c).strip() for c in d.columns]
    d["timestamp"] = pd.to_datetime(
        d["Data Acquisition Time"], dayfirst=True, errors="coerce"
    )
    d["rainfall_mm"] = pd.to_numeric(
        d["Telemetry Hourly Rainfall (mm)"], errors="coerce"
    )
    d.loc[d["rainfall_mm"] < 0, "rainfall_mm"] = np.nan
    d["station_clean"] = d["Station"].astype(str).str.strip()
    d = d.dropna(subset=["timestamp", "station_clean"])
    d = d.sort_values(["station_clean", "timestamp"])
    d = d.drop_duplicates(["station_clean", "timestamp"], keep="last")

    g = d.groupby("station_clean", group_keys=False)
    for h in [1, 3, 6, 12, 24, 72]:
        d[f"rainfall_{h}h_mm"] = (
            g["rainfall_mm"]
            .rolling(h, min_periods=max(1, h // 2))
            .sum()
            .reset_index(level=0, drop=True)
        )

    df = d
    station_latest = (
        d.dropna(subset=FEATURES)
        .sort_values("timestamp")
        .groupby("station_clean", as_index=False)
        .tail(1)
        .copy()
    )
    station_coords = (
        d.sort_values("timestamp")
        .groupby("station_clean", as_index=False)
        .tail(1)[
            ["station_clean", "Station", "District", "Latitude", "Longitude"]
        ]
        .drop_duplicates("station_clean")
    )

    if MODEL.exists():
        model = joblib.load(MODEL)
    if META.exists():
        meta = json.loads(META.read_text(encoding="utf-8"))
    if PCTS.exists():
        pcts = json.loads(PCTS.read_text(encoding="utf-8"))

load_data()

def clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, float(x)))

def percentile_pressure(value, col):
    q = pcts.get(col, {})
    if not q or value is None or not np.isfinite(value):
        return 0.0
    p75, p90, p95, p99 = q["p75"], q["p90"], q["p95"], q["p99"]
    if value <= p75:
        return 0.0
    if value <= p90:
        return 35.0 * (value-p75) / max(p90-p75, 1e-9)
    if value <= p95:
        return 35.0 + 25.0 * (value-p90) / max(p95-p90, 1e-9)
    if value <= p99:
        return 60.0 + 25.0 * (value-p95) / max(p99-p95, 1e-9)
    return 90.0

def anomaly_score(row):
    if model is None:
        return 0.0
    x = pd.DataFrame([[row[c] for c in FEATURES]], columns=FEATURES)
    decision = float(model.decision_function(x)[0])
    # More negative = more anomalous. Smoothly map to 0-100.
    return clamp(100.0 / (1.0 + math.exp(5.0 * decision)) - 50.0, 0, 100)

def risk_from_features(row, slope=None, elevation=None):
    pressures = [
        percentile_pressure(row.get("rainfall_1h_mm"), "rainfall_1h_mm"),
        percentile_pressure(row.get("rainfall_3h_mm"), "rainfall_3h_mm"),
        percentile_pressure(row.get("rainfall_6h_mm"), "rainfall_6h_mm"),
        percentile_pressure(row.get("rainfall_24h_mm"), "rainfall_24h_mm"),
        percentile_pressure(row.get("rainfall_72h_mm"), "rainfall_72h_mm"),
    ]
    rain_pressure = (
        0.24 * pressures[0] + 0.24 * pressures[1] +
        0.20 * pressures[2] + 0.18 * pressures[3] +
        0.14 * pressures[4]
    )
    ml = anomaly_score(row)
    terrain = 0.0
    if slope is not None:
        terrain += clamp((float(slope) - 20) / 50 * 100)
    if elevation is not None:
        terrain += clamp((float(elevation) - 500) / 2500 * 100)
    terrain = terrain / (2 if slope is not None and elevation is not None else 1)
    score = clamp(0.55 * rain_pressure + 0.35 * ml + 0.10 * terrain)
    if score >= 78:
        level = "CRITICAL"
        action = "Move to safer/high ground and follow local authority instructions."
        lead = "Immediate monitoring"
    elif score >= 58:
        level = "HIGH"
        action = "Prepare evacuation route; avoid streams, drains and low crossings."
        lead = "Near-term escalation possible"
    elif score >= 35:
        level = "MODERATE"
        action = "Stay alert, check official alerts and avoid unnecessary travel near channels."
        lead = "Watch conditions"
    else:
        level = "LOW"
        action = "Continue monitoring rainfall and official local advisories."
        lead = "No immediate model signal"
    return {
        "risk_score": round(score, 1),
        "risk_level": level,
        "action": action,
        "lead_time_window": lead,
        "ml_anomaly_score": round(ml, 1),
        "rainfall_pressure": round(rain_pressure, 1),
        "terrain_factor": round(terrain, 1),
    }

class PredictRequest(BaseModel):
    station: str
    slope_degrees: float | None = None
    elevation_m: float | None = None

@app.get("/", response_class=HTMLResponse)
def root():
    return (BASE / "web" / "index.html").read_text(encoding="utf-8")

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "data_rows": int(len(df)),
        "stations": int(df["station_clean"].nunique()),
    }

@app.get("/api/metrics")
def metrics():
    return {
        "status": "trained_real_data",
        "model_type": meta.get("model_type"),
        "training_rows": meta.get("training_rows"),
        "stations": meta.get("stations"),
        "training_period": [meta.get("start"), meta.get("end")],
        "features": meta.get("features"),
        "contamination": meta.get("contamination"),
        "historical_events_reference": meta.get("historical_flash_flood_events_reference"),
        "supervised_flood_labels_available": meta.get(
            "supervised_flood_labels_available_for_this_rainfall_period"
        ),
        "note": meta.get("important_note"),
    }

@app.get("/api/stations")
def stations():
    out = []
    for _, r in station_coords.iterrows():
        latest = station_latest[station_latest["station_clean"] == r["station_clean"]]
        if latest.empty:
            continue
        row = latest.iloc[0]
        risk = risk_from_features(row)
        out.append({
            "station": r["Station"],
            "district": r["District"],
            "lat": float(r["Latitude"]),
            "lon": float(r["Longitude"]),
            "timestamp": str(row["timestamp"]),
            "rainfall_1h": round(float(row["rainfall_1h_mm"]), 2),
            "rainfall_3h": round(float(row["rainfall_3h_mm"]), 2),
            "rainfall_24h": round(float(row["rainfall_24h_mm"]), 2),
            "risk_score": risk["risk_score"],
            "risk_level": risk["risk_level"],
        })
    return {"stations": out}

@app.get("/api/station/{station_name}")
def station_detail(station_name: str):
    match = station_latest[
        station_latest["station_clean"].str.lower() == station_name.lower()
    ]
    if match.empty:
        raise HTTPException(404, "Station not found")
    r = match.iloc[0]
    return {
        "station": str(r["Station"]),
        "district": str(r["District"]),
        "lat": float(r["Latitude"]),
        "lon": float(r["Longitude"]),
        "timestamp": str(r["timestamp"]),
        "rainfall": {h: round(float(r[f"rainfall_{h}h_mm"]), 2) for h in [1,3,6,12,24,72]},
        "risk": risk_from_features(r),
    }

@app.post("/api/predict")
def predict(req: PredictRequest):
    match = station_latest[
        station_latest["station_clean"].str.lower() == req.station.lower()
    ]
    if match.empty:
        raise HTTPException(404, "Station not found")
    r = match.iloc[0]
    result = risk_from_features(r, req.slope_degrees, req.elevation_m)
    result.update({
        "station": str(r["Station"]),
        "district": str(r["District"]),
        "timestamp": str(r["timestamp"]),
        "lat": float(r["Latitude"]),
        "lon": float(r["Longitude"]),
        "rainfall": {
            h: round(float(r[f"rainfall_{h}h_mm"]), 2) for h in [1,3,6,12,24,72]
        },
        "disclaimer": (
            "ML anomaly score is trained on real Uttarakhand telemetry rainfall. "
            "Risk level is an engineering prototype signal, not a certified flood probability."
        )
    })
    return result

@app.get("/api/summary")
def summary():
    if station_latest.empty:
        return {}
    risks = []
    for _, r in station_latest.iterrows():
        risks.append(risk_from_features(r))
    levels = pd.Series([x["risk_level"] for x in risks]).value_counts().to_dict()
    return {
        "stations": int(len(station_latest)),
        "critical": int(levels.get("CRITICAL", 0)),
        "high": int(levels.get("HIGH", 0)),
        "moderate": int(levels.get("MODERATE", 0)),
        "low": int(levels.get("LOW", 0)),
        "latest_data": str(station_latest["timestamp"].max()),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
