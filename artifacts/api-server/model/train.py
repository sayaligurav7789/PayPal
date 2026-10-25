from __future__ import annotations

import gzip
import hashlib
import json
import shlex
import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from fetch_dataset import DEFAULT_OUTPUT, EXPECTED_MD5


MODEL_DIR = Path(__file__).resolve().parent
ASSET_DIR = MODEL_DIR / "assets"
CLASS_COLUMN = "Class"
PCA_FEATURES = [f"V{index}" for index in range(1, 29)]
FEATURE_COLUMNS = ["Time", *PCA_FEATURES, "Amount"]
EXPECTED_ROWS = 284_807
EXPECTED_FRAUDS = 492
TEST_SIZE = 0.2
RANDOM_STATE = 42
CLASSIFICATION_THRESHOLD = 0.5
RISK_HIGH_THRESHOLD = 0.7
RISK_MEDIUM_THRESHOLD = 0.3


def md5_file(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_arff(path: Path) -> pd.DataFrame:
    columns: list[str] = []
    data_line: int | None = None
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source):
            stripped = line.strip()
            if stripped.lower() == "@data":
                data_line = line_number + 1
                break
            if stripped.lower().startswith("@attribute "):
                parts = shlex.split(stripped)
                if len(parts) < 3:
                    raise ValueError(f"Invalid ARFF attribute line: {stripped}")
                columns.append(parts[1])

    expected_columns = {*FEATURE_COLUMNS, CLASS_COLUMN}
    if data_line is None or set(columns) != expected_columns or len(columns) != 31:
        raise ValueError(
            "Dataset schema mismatch. Expected Time, Amount, V1-V28, and Class."
        )

    data = pd.read_csv(
        path,
        header=None,
        names=columns,
        skiprows=data_line,
        low_memory=False,
    )
    data = data.loc[:, [*FEATURE_COLUMNS, CLASS_COLUMN]]
    for column in (*FEATURE_COLUMNS, CLASS_COLUMN):
        data[column] = pd.to_numeric(data[column], errors="raise")
    if data.isna().any().any():
        raise ValueError("Dataset contains missing values; refusing to train.")
    if not set(data[CLASS_COLUMN].unique()).issubset({0, 1}):
        raise ValueError("Expected binary Class labels 0 and 1.")
    return data


def risk_level(probability: float) -> str:
    if probability >= RISK_HIGH_THRESHOLD:
        return "High"
    if probability >= RISK_MEDIUM_THRESHOLD:
        return "Medium"
    return "Low"


def train(dataset_path: Path) -> dict[str, Any]:
    dataset_path = dataset_path.expanduser().resolve()
    if not dataset_path.is_file():
        raise FileNotFoundError(
            f"Dataset not found at {dataset_path}. Run fetch_dataset.py first."
        )
    checksum = md5_file(dataset_path)
    if checksum != EXPECTED_MD5:
        raise ValueError(
            "Dataset checksum does not match the verified OpenML 42175 mirror. "
            f"Expected {EXPECTED_MD5}, got {checksum}."
        )

    data = read_arff(dataset_path)
    fraud_rows = int(data[CLASS_COLUMN].sum())
    if len(data) != EXPECTED_ROWS or fraud_rows != EXPECTED_FRAUDS:
        raise ValueError(
            f"Dataset validation failed: rows={len(data)}, frauds={fraud_rows}; "
            f"expected rows={EXPECTED_ROWS}, frauds={EXPECTED_FRAUDS}."
        )

    row_indices = np.arange(len(data))
    train_indices, test_indices = train_test_split(
        row_indices,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=data[CLASS_COLUMN].to_numpy(),
    )
    x_train = data.iloc[train_indices][FEATURE_COLUMNS]
    y_train = data.iloc[train_indices][CLASS_COLUMN].astype(int)
    x_test = data.iloc[test_indices][FEATURE_COLUMNS]
    y_test = data.iloc[test_indices][CLASS_COLUMN].astype(int)

    # The imbalanced-learn pipeline fits scaling and SMOTE only during fit(X_train, y_train).
    # predict_proba(X_test) sees the untouched, naturally imbalanced holdout split.
    model = Pipeline(
        steps=[
            ("scale", StandardScaler()),
            ("smote", SMOTE(random_state=RANDOM_STATE)),
            (
                "classifier",
                HistGradientBoostingClassifier(
                    max_iter=120,
                    max_leaf_nodes=31,
                    learning_rate=0.1,
                    l2_regularization=1.0,
                    random_state=RANDOM_STATE,
                ),
            ),
        ]
    )
    model.fit(x_train, y_train)
    probabilities = model.predict_proba(x_test)[:, 1]
    predictions = (probabilities >= CLASSIFICATION_THRESHOLD).astype(int)
    true_negative, false_positive, false_negative, true_positive = (
        int(value)
        for value in confusion_matrix(y_test, predictions, labels=[0, 1]).ravel()
    )

    metrics: dict[str, Any] = {
        "status": "ready",
        "dataset": "OpenML 42175 mirror of Kaggle mlg-ulb/creditcardfraud",
        "datasetRows": int(len(data)),
        "fraudRows": fraud_rows,
        "trainRows": int(len(train_indices)),
        "testRows": int(len(test_indices)),
        "precision": float(
            precision_score(y_test, predictions, zero_division=0)
        ),
        "recall": float(recall_score(y_test, predictions, zero_division=0)),
        "f1Score": float(f1_score(y_test, predictions, zero_division=0)),
        "confusionMatrix": {
            "trueNegative": true_negative,
            "falsePositive": false_positive,
            "falseNegative": false_negative,
            "truePositive": true_positive,
        },
        "splitMethod": "Stratified 80/20 train/test split; random_state=42",
        "smoteAppliedTo": "Training split only; holdout class prevalence unchanged",
        "threshold": CLASSIFICATION_THRESHOLD,
        "modelName": "StandardScaler + SMOTE + HistGradientBoostingClassifier",
        "message": (
            "Metrics are measured on the untouched stratified holdout split. "
            "This benchmark is not a production payment-risk evaluation."
        ),
        "sourceMd5": checksum,
        "randomState": RANDOM_STATE,
        "riskThresholds": {
            "medium": RISK_MEDIUM_THRESHOLD,
            "high": RISK_HIGH_THRESHOLD,
        },
        "scikitLearnVersion": sklearn.__version__,
    }

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, ASSET_DIR / "model.joblib", compress=3)
    (ASSET_DIR / "metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )

    test_frame = data.iloc[test_indices].copy()
    test_frame.insert(0, "rowNumber", test_indices + 1)
    test_frame["fraudProbability"] = probabilities
    test_frame["risk"] = [risk_level(float(value)) for value in probabilities]
    test_frame["actualFraud"] = test_frame[CLASS_COLUMN].astype(bool)
    test_frame["id"] = [f"ULB-{index:06d}" for index in test_indices + 1]
    test_frame["features"] = test_frame[PCA_FEATURES].to_dict(orient="records")
    output_columns = [
        "id",
        "rowNumber",
        "Time",
        "Amount",
        "actualFraud",
        "fraudProbability",
        "risk",
        "features",
    ]
    test_frame = test_frame[output_columns].sort_values("rowNumber")
    test_frame.rename(
        columns={"Time": "time", "Amount": "amount"}, inplace=True
    )
    test_frame.to_json(
        ASSET_DIR / "test_transactions.jsonl.gz",
        orient="records",
        lines=True,
        double_precision=12,
        compression={"method": "gzip", "compresslevel": 6},
    )
    return metrics


if __name__ == "__main__":
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUTPUT
    result = train(source)
    print(json.dumps(result, indent=2))
