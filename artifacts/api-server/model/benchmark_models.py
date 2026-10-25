
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline
from sklearn.ensemble import (
    RandomForestClassifier,
    GradientBoostingClassifier,
    HistGradientBoostingClassifier,
)
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from train import (
    DEFAULT_OUTPUT,
    FEATURE_COLUMNS,
    CLASS_COLUMN,
    RANDOM_STATE,
    TEST_SIZE,
    read_arff,
    md5_file,
    EXPECTED_MD5,
    EXPECTED_ROWS,
    EXPECTED_FRAUDS,
)

MODEL_DIR = Path(__file__).resolve().parent
RESULTS_DIR = MODEL_DIR / "benchmark_results"


def main() -> None:
    dataset_path = Path(DEFAULT_OUTPUT).expanduser().resolve()

    if not dataset_path.is_file():
        raise FileNotFoundError(
            f"Dataset not found: {dataset_path}. "
            "Run fetch_dataset.py first."
        )

    if md5_file(dataset_path) != EXPECTED_MD5:
        raise ValueError("Dataset checksum verification failed.")

    data = read_arff(dataset_path)
    fraud_count = int(data[CLASS_COLUMN].sum())

    if len(data) != EXPECTED_ROWS or fraud_count != EXPECTED_FRAUDS:
        raise ValueError("Dataset row count or fraud count is unexpected.")

    X = data[FEATURE_COLUMNS]
    y = data[CLASS_COLUMN].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    # Identical split and training-only SMOTE for every model.
    models = {
        "Random Forest": RandomForestClassifier(
            n_estimators=200,
            class_weight=None,
            random_state=RANDOM_STATE,
            n_jobs=-1,
        ),
        "Gradient Boosting": GradientBoostingClassifier(
            n_estimators=100,
            learning_rate=0.1,
            random_state=RANDOM_STATE,
        ),
        "XGBoost": XGBClassifier(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            eval_metric="logloss",
            random_state=RANDOM_STATE,
            n_jobs=-1,
        ),
        "HistGradientBoosting": HistGradientBoostingClassifier(
            max_iter=120,
            max_leaf_nodes=31,
            learning_rate=0.1,
            l2_regularization=1.0,
            random_state=RANDOM_STATE,
        ),
    }

    results = []

    for name, classifier in models.items():
        print(f"\nTraining {name}...", flush=True)

        pipeline = Pipeline(
            steps=[
                ("scale", StandardScaler()),
                ("smote", SMOTE(random_state=RANDOM_STATE)),
                ("classifier", classifier),
            ]
        )

        start = time.perf_counter()
        pipeline.fit(X_train, y_train)
        train_seconds = time.perf_counter() - start

        start = time.perf_counter()
        probabilities = pipeline.predict_proba(X_test)[:, 1]
        predict_seconds = time.perf_counter() - start

        # Match the current integrated model's threshold.
        predictions = (probabilities >= 0.5).astype(int)

        tn, fp, fn, tp = confusion_matrix(
            y_test, predictions, labels=[0, 1]
        ).ravel()

        row = {
            "model": name,
            "precision": precision_score(
                y_test, predictions, zero_division=0
            ),
            "recall": recall_score(
                y_test, predictions, zero_division=0
            ),
            "f1": f1_score(y_test, predictions, zero_division=0),
            "pr_auc": average_precision_score(y_test, probabilities),
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_positive": int(tp),
            "train_seconds": round(train_seconds, 3),
            "predict_seconds": round(predict_seconds, 3),
            "threshold": 0.5,
        }
        results.append(row)

        print(
            f"Precision={row['precision']:.4f} | "
            f"Recall={row['recall']:.4f} | "
            f"F1={row['f1']:.4f} | "
            f"PR-AUC={row['pr_auc']:.4f} | "
            f"FP={fp} | FN={fn} | "
            f"Train={train_seconds:.1f}s",
            flush=True,
        )

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    results.sort(key=lambda row: row["pr_auc"], reverse=True)

    output = {
        "datasetRows": len(data),
        "fraudRows": fraud_count,
        "trainRows": len(X_train),
        "testRows": len(X_test),
        "split": "Stratified 80/20, random_state=42",
        "smote": "Training split only",
        "threshold": 0.5,
        "scikitLearnVersion": sklearn.__version__,
        "rankingMetric": "PR-AUC (average precision)",
        "results": results,
        "note": (
            "Benchmark only. Existing production model artifacts "
            "were not modified."
        ),
    }

    (RESULTS_DIR / "comparison.json").write_text(
        json.dumps(output, indent=2),
        encoding="utf-8",
    )

    pd.DataFrame(results).to_csv(
        RESULTS_DIR / "comparison.csv",
        index=False,
    )

    print("\n=== Model comparison (ranked by PR-AUC) ===")
    print(
        pd.DataFrame(results)[
            [
                "model",
                "precision",
                "recall",
                "f1",
                "pr_auc",
                "false_positive",
                "false_negative",
                "train_seconds",
            ]
        ].to_string(index=False, float_format=lambda value: f"{value:.4f}")
    )
    print(f"\nSaved results to: {RESULTS_DIR}")


if __name__ == "__main__":
    main()
