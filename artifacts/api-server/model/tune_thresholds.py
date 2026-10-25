
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline
from sklearn.ensemble import (
    RandomForestClassifier,
    HistGradientBoostingClassifier,
)
from sklearn.metrics import (
    average_precision_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

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


def evaluate(name, model, X, y, thresholds):
    probabilities = model.predict_proba(X)[:, 1]
    rows = []

    for threshold in thresholds:
        predictions = (probabilities >= threshold).astype(int)
        tn, fp, fn, tp = confusion_matrix(
            y, predictions, labels=[0, 1]
        ).ravel()

        rows.append({
            "model": name,
            "threshold": float(threshold),
            "precision": precision_score(
                y, predictions, zero_division=0
            ),
            "recall": recall_score(
                y, predictions, zero_division=0
            ),
            "f1": f1_score(y, predictions, zero_division=0),
            "pr_auc": average_precision_score(y, probabilities),
            "true_positive": int(tp),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_negative": int(tn),
        })

    return rows


def main():
    dataset_path = Path(DEFAULT_OUTPUT).expanduser().resolve()

    if not dataset_path.is_file():
        raise FileNotFoundError(
            f"Dataset not found: {dataset_path}. Run fetch_dataset.py first."
        )

    if md5_file(dataset_path) != EXPECTED_MD5:
        raise ValueError("Dataset checksum verification failed.")

    data = read_arff(dataset_path)
    if len(data) != EXPECTED_ROWS:
        raise ValueError("Unexpected dataset row count.")
    if int(data[CLASS_COLUMN].sum()) != EXPECTED_FRAUDS:
        raise ValueError("Unexpected fraud count.")

    X = data[FEATURE_COLUMNS]
    y = data[CLASS_COLUMN].astype(int)

    # First isolate the final test set.
    X_dev, X_test, y_dev, y_test = train_test_split(
        X, y, test_size=TEST_SIZE,
        random_state=RANDOM_STATE, stratify=y
    )

    # Split the development data into training and validation.
    X_train, X_val, y_train, y_val = train_test_split(
        X_dev, y_dev, test_size=0.25,
        random_state=RANDOM_STATE, stratify=y_dev
    )

    classifiers = {
        "Random Forest": RandomForestClassifier(
            n_estimators=200,
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

    thresholds = np.round(np.arange(0.10, 0.951, 0.05), 2)
    validation_rows = []

    for name, classifier in classifiers.items():
        print(f"\nTraining {name}...", flush=True)

        pipeline = Pipeline([
            ("scale", StandardScaler()),
            ("smote", SMOTE(random_state=RANDOM_STATE)),
            ("classifier", classifier),
        ])

        pipeline.fit(X_train, y_train)

        validation_rows.extend(
            evaluate(name, pipeline, X_val, y_val, thresholds)
        )

    validation = pd.DataFrame(validation_rows)

    # Choose the threshold with the highest validation F1.
    # This is a selection criterion, not a universal business optimum.
    best_rows = (
        validation.sort_values(
            ["model", "f1", "precision"],
            ascending=[True, False, False],
        )
        .groupby("model", as_index=False)
        .first()
    )

    print("\n=== Best validation thresholds ===")
    print(best_rows[
        ["model", "threshold", "precision", "recall", "f1"]
    ].to_string(index=False, float_format=lambda x: f"{x:.4f}"))

    # Refit on all development data, then evaluate once on final test data.
    final_rows = []

    for _, choice in best_rows.iterrows():
        name = choice["model"]
        classifier = classifiers[name]

        pipeline = Pipeline([
            ("scale", StandardScaler()),
            ("smote", SMOTE(random_state=RANDOM_STATE)),
            ("classifier", classifier),
        ])
        pipeline.fit(X_dev, y_dev)

        threshold = float(choice["threshold"])
        final_rows.extend(
            evaluate(name, pipeline, X_test, y_test, [threshold, 0.5])
        )

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    validation.to_csv(
        RESULTS_DIR / "threshold_validation.csv", index=False
    )
    pd.DataFrame(final_rows).to_csv(
        RESULTS_DIR / "threshold_test_results.csv", index=False
    )

    print("\n=== Final untouched test-set results ===")
    print(pd.DataFrame(final_rows)[[
        "model", "threshold", "precision", "recall", "f1",
        "false_positive", "false_negative", "pr_auc"
    ]].to_string(index=False, float_format=lambda x: f"{x:.4f}"))

    print(f"\nResults saved in: {RESULTS_DIR}")
    print("Existing production model files were not modified.")


if __name__ == "__main__":
    main()
