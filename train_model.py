from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

BASE = Path(__file__).resolve().parent
DATA = BASE / "rainfall_tel_hr_uttarakhand_uk_2021_2025.csv"
MODEL = BASE / "flashguard_rainfall_anomaly_model.joblib"
META = BASE / "model_metadata.json"
PCTS = BASE / "rainfall_percentiles.json"

FEATURES = [
    "rainfall_1h_mm",
    "rainfall_3h_mm",
    "rainfall_6h_mm",
    "rainfall_12h_mm",
    "rainfall_24h_mm",
    "rainfall_72h_mm",
]

d = pd.read_csv(
    DATA,
    usecols=[
        "Data Acquisition Time",
        "Telemetry Hourly Rainfall (mm)",
        "Station",
    ],
    low_memory=True,
)

d.columns = [str(c).strip() for c in d.columns]
d["timestamp"] = pd.to_datetime(
    d["Data Acquisition Time"],
    dayfirst=True,
    errors="coerce",
)
d["rainfall_mm"] = pd.to_numeric(
    d["Telemetry Hourly Rainfall (mm)"],
    errors="coerce",
)
d.loc[d["rainfall_mm"] < 0, "rainfall_mm"] = np.nan
d["station_clean"] = d["Station"].astype(str).str.strip()

d = (
    d.dropna(
        subset=["timestamp", "station_clean"]
    )
    .sort_values(
        ["station_clean", "timestamp"]
    )
    .drop_duplicates(
        ["station_clean", "timestamp"],
        keep="last",
    )
)

# For training, use the full telemetry history.
g = d.groupby(
    "station_clean",
    group_keys=False,
)

for h in [1, 3, 6, 12, 24, 72]:
    d[f"rainfall_{h}h_mm"] = (
        g["rainfall_mm"]
        .rolling(
            h,
            min_periods=max(1, h // 2),
        )
        .sum()
        .reset_index(
            level=0,
            drop=True,
        )
    )

train = d.dropna(
    subset=FEATURES
).copy()

X = train[FEATURES].astype(float)

pipe = Pipeline([
    ("scale", StandardScaler()),
    (
        "model",
        IsolationForest(
            n_estimators=250,
            contamination=0.05,
            random_state=42,
            n_jobs=-1,
        ),
    ),
])

pipe.fit(X)
joblib.dump(pipe, MODEL)

pcts = {}

for c in FEATURES:
    s = train[c].dropna()

    pcts[c] = {
        "p50": float(s.quantile(0.50)),
        "p75": float(s.quantile(0.75)),
        "p90": float(s.quantile(0.90)),
        "p95": float(s.quantile(0.95)),
        "p99": float(s.quantile(0.99)),
    }

PCTS.write_text(
    json.dumps(
        pcts,
        indent=2,
    ),
    encoding="utf-8",
)

meta = {
    "model_type": "IsolationForest rainfall anomaly model",
    "trained_on_real_data": True,
    "training_rows": int(len(train)),
    "stations": int(
        train["station_clean"].nunique()
    ),
    "start": str(
        train["timestamp"].min()
    ),
    "end": str(
        train["timestamp"].max()
    ),
    "features": FEATURES,
    "contamination": 0.05,
    "historical_flash_flood_events_reference": 122,
    "supervised_flood_labels_available_for_this_rainfall_period": False,
    "important_note": (
        "This is a real-data rainfall anomaly model, "
        "not a validated supervised flood-probability classifier. "
        "The available 122 historical events are 1970-2020."
    ),
}

META.write_text(
    json.dumps(
        meta,
        indent=2,
    ),
    encoding="utf-8",
)

print("FLASHGUARD model trained successfully.")
print(
    json.dumps(
        meta,
        indent=2,
    )
)
