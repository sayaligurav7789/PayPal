from __future__ import annotations

import hashlib
import os
import tempfile
import urllib.request
from pathlib import Path


DATA_URL = "https://www.openml.org/data/v1/download/21756045/CreditCardFraudDetection.arff"
EXPECTED_MD5 = "f9af8fd7966f2d2b8a3e5e67158a7757"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "data" / "creditcardfraud.arff"


def md5_file(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(output: Path = DEFAULT_OUTPUT) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix="creditcardfraud-", suffix=".part", dir=output.parent
    )
    temporary = Path(temporary_name)
    os.close(descriptor)
    try:
        request = urllib.request.Request(
            DATA_URL, headers={"User-Agent": "FraudShield-academic-prototype/1.0"}
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            with temporary.open("wb") as target:
                while chunk := response.read(1024 * 1024):
                    target.write(chunk)
        actual_md5 = md5_file(temporary)
        if actual_md5 != EXPECTED_MD5:
            raise ValueError(
                f"Dataset checksum mismatch: expected {EXPECTED_MD5}, got {actual_md5}"
            )
        temporary.replace(output)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return output


if __name__ == "__main__":
    location = fetch()
    print(f"Verified ULB credit-card fraud dataset mirror: {location}")
    print(f"MD5: {md5_file(location)}")
