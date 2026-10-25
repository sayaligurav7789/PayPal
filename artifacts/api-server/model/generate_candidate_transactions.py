
from __future__ import annotations

import gzip
import json
from pathlib import Path

import joblib

from train import (
    DEFAULT_OUTPUT,
    EXPECTED_MD5,
    FEATURE_COLUMNS,
    PCA_FEATURES,
    CLASS_COLUMN,
    TEST_SIZE,
    RANDOM_STATE,
    md5_file,
    read_arff,
)
from sklearn.model_selection import train_test_split

MODEL_DIR = Path(__file__).resolve().parent
CANDIDATE_DIR = MODEL_DIR / "candidate_random_forest"
OUTPUT_PATH = CANDIDATE_DIR / "test_transactions.jsonl.gz"
THRESHOLD = 0.6


def risk_level(probability: float) -> str:
    if probability >= 0.7:
        return "High"
    if probability >= 0.3:
        return "Medium"
    return "Low"


def main():
    dataset_path = Path(DEFAULT_OUTPUT).expanduser().resolve()

    if not dataset_path.is_file():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")
    if md5_file(dataset_path) != EXPECTED_MD5:
        raise ValueError("Dataset checksum verification failed.")

    data = read_arff(dataset_path)

    row_indices = __import__("numpy").arange(len(data))
    _, test_indices = train_test_split(
        row_indices,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=data[CLASS_COLUMN].to_numpy(),
    )

    test_frame = data.iloc[test_indices].copy()
    model = joblib.load(CANDIDATE_DIR / "model.joblib")

    probabilities = model.predict_proba(
        test_frame[FEATURE_COLUMNS]
    )[:, 1]

    test_frame.insert(0, "rowNumber", test_indices + 1)
    test_frame["fraudProbability"] = probabilities
    test_frame["risk"] = [risk_level(float(p)) for p in probabilities]
    test_frame["actualFraud"] = test_frame[CLASS_COLUMN].astype(bool)
    test_frame["id"] = [
        f"ULB-{index + 1:06d}" for index in test_indices
    ]
    test_frame["features"] = test_frame[PCA_FEATURES].to_dict(
        orient="records"
    )

    test_frame = test_frame[
        [
            "id", "rowNumber", "Time", "Amount", "actualFraud",
            "fraudProbability", "risk", "features",
        ]
    ].sort_values("rowNumber")

    test_frame.rename(
        columns={"Time": "time", "Amount": "amount"},
        inplace=True,
    )

    CANDIDATE_DIR.mkdir(parents=True, exist_ok=True)
    test_frame.to_json(
        OUTPUT_PATH,
        orient="records",
        lines=True,
        double_precision=12,
        compression={"method": "gzip", "compresslevel": 6},
    )

    print(f"Saved {len(test_frame)} candidate transactions to:")
    print(OUTPUT_PATH)
    print(f"Threshold: {THRESHOLD}")
    print("Original transaction records were not modified.")


if __name__ == "__main__":
    main()
