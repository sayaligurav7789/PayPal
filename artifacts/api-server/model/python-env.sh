#!/usr/bin/env bash
set -euo pipefail

python_mm="$(python3 -c 'import sys; print(f"python{sys.version_info.major}.{sys.version_info.minor}")')"
mapfile -t package_roots < <(find /nix/store -maxdepth 1 -type d -name "*${python_mm}-*" -print)
mapfile -t site_packages < <(
  for package_root in "${package_roots[@]}"; do
    find "$package_root" -maxdepth 5 -type d -path "*/lib/${python_mm}/site-packages" -print
  done | sort -u
)

if ((${#site_packages[@]} == 0)); then
  echo "No Nix Python package paths found for ${python_mm}." >&2
  exit 1
fi

printf -v package_path '%s:' "${site_packages[@]}"
export PYTHONPATH="${package_path}${PYTHONPATH:+:${PYTHONPATH}}"
exec python3 "$@"
