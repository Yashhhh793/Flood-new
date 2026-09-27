# FLASHGUARD — Full Deployable Prototype

## What is included
- FastAPI backend
- Dark responsive command-center dashboard
- Leaflet + OpenStreetMap interactive Uttarakhand station map
- Real Uttarakhand hourly telemetry rainfall data (2022–2025)
- Real-data IsolationForest rainfall anomaly ML model
- Rolling rainfall features: 1h, 3h, 6h, 12h, 24h, 72h
- Station-wise risk dashboard
- Prediction API
- Model metrics/status API
- 122-event historical Uttarakhand flash-flood inventory for reference

## Important scientific limitation
The supplied rainfall telemetry is 2022–2025, while the historical flash-flood event inventory is 1970–2020. Because those periods do not overlap, this package does NOT pretend to have a supervised flood classifier or fake accuracy/ROC-AUC numbers.

The included ML model is a genuine unsupervised rainfall-anomaly model trained on the real telemetry data. The dashboard's risk level is an engineering prototype signal built from the ML anomaly score + rainfall pressure, with optional terrain inputs.

For a validated supervised flood model, add a real rainfall dataset that overlaps the 1970–2020 event dates, then build event-aligned labels.

## Local
pip install -r requirements.txt
python train_model.py
uvicorn main:app --host 0.0.0.0 --port 8000

Open http://127.0.0.1:8000

## Render
Build Command:
pip install -r requirements.txt

Start Command:
uvicorn main:app --host 0.0.0.0 --port $PORT

The trained model file is already included, so Render does not need to train during every deployment.

If you replace/retrain the model, use:
pip install -r requirements.txt && python train_model.py

## Main endpoints
GET /api/health
GET /api/metrics
GET /api/stations
GET /api/station/{station}
GET /api/summary
POST /api/predict
