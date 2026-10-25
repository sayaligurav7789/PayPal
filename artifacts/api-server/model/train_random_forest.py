
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    confusion_matrix,
    precision_score,
    recall_score,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline

from train import (
    ASSET_DIR,
    CLASS_COLUMN,
    FEATURE_COLUMNS,
    RANDOM_STATE,
    TEST_SIZE,
    EXPECTED_ROWS,
    EXPECTED_FRAUDS,
    DEFAULT_OUTPUT,
    EXPECTED_MD5,
    md5_file,
    read_arff,
)

MODEL_DIR = Path(__file__).resolve().parent
CANDIDATE_DIR = MODEL_DIR / "candidate_random_forest"
THRESHOLD = 0.6


def main():
    dataset_path = Path(DEFAULT_OUTPUT).expanduser().resolve()

    if not dataset_path.is_file():
        raise FileNotFoundError(
            f"Dataset not found: {dataset_path}. Run fetch_dataset.py first."
        )

    if md5_file(dataset_path) != EXPECTED_MD5:
        raise ValueError("Dataset checksum verification failed.")

    data = read_arff(dataset_path)
    fraud_rows = int(data[CLASS_COLUMN].sum())

    if len(data) != EXPECTED_ROWS or fraud_rows != EXPECTED_FRAUDS:
        raise ValueError("Dataset row count or fraud count mismatch.")

    X = data[FEATURE_COLUMNS]
    y = data[CLASS_COLUMN].astype(int)

    X_dev, X_test, y_dev, y_test = train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    model = Pipeline([
        ("scale", StandardScaler()),
        ("smote", SMOTE(random_state=RANDOM_STATE)),
        ("classifier", RandomForestClassifier(
            n_estimators=200,
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )),
    ])

    model.fit(X_dev, y_dev)
    probabilities = model.predict_proba(X_test)[:, 1]
    predictions = (probabilities >= THRESHOLD).astype(int)

    tn, fp, fn, tp = (
        int(v) for v in confusion_matrix(
            y_test, predictions, labels=[0, 1]
        ).ravel()
    )

    metrics = {
        "status": "candidate",
        "modelName": "StandardScaler + SMOTE + RandomForestClassifier",
        "threshold": THRESHOLD,
        "dataset": "OpenML 42175 mirror of Kaggle mlg-ulb/creditcardfraud",
        "datasetRows": int(len(data)),
        "fraudRows": fraud_rows,
        "trainRows": int(len(X_dev)),
        "testRows": int(len(X_test)),
        "precision": float(precision_score(
            y_test, predictions, zero_division=0
        )),
        "recall": float(recall_score(
            y_test, predictions, zero_division=0
        )),
        "f1Score": float(f1_score(
            y_test, predictions, zero_division=0
        )),
        "confusionMatrix": {
            "trueNegative": tn,
            "falsePositive": fp,
            "falseNegative": fn,
            "truePositive": tp,
        },
        "splitMethod": "Stratified 80/20 split; random_state=42",
        "smoteAppliedTo": "Training data only",
        "riskThresholds": {"medium": 0.3, "high": 0.7},
        "message": (
            "Candidate model evaluated on the stratified holdout. "
            "Not a production payment-risk evaluation."
        ),
    }

    CANDIDATE_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, CANDIDATE_DIR / "model.joblib", compress=3)
    (CANDIDATE_DIR / "metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )

    print(json.dumps(metrics, indent=2))
    print(f"\nCandidate saved to: {CANDIDATE_DIR}")
    print("Existing production model artifacts were not modified.")


if __name__ == "__main__":
    main()
