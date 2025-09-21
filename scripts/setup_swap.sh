#!/usr/bin/env bash
set -euo pipefail

show_help() {
  cat <<'USAGE'
Usage: setup_swap.sh [--size 2G] [--file /swapfile] [--swappiness 10] [--force]

Creates or refreshes a swap file on the host. Run as root (or with sudo).
  --size        Swap size in IEC format (e.g., 2G, 1536M). Default: 2G
  --file        Swap file path. Default: /swapfile
  --swappiness  vm.swappiness value to apply. Default: 10
  --force       Recreate the swap file even if it already exists and is active
  -h, --help    Show this help message
USAGE
}

SIZE="2G"
SWAPFILE="/swapfile"
SWAPPINESS="10"
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --size)
      [[ $# -ge 2 ]] || { echo "--size requires a value" >&2; exit 1; }
      SIZE="$2"
      shift 2
      ;;
    --file)
      [[ $# -ge 2 ]] || { echo "--file requires a value" >&2; exit 1; }
      SWAPFILE="$2"
      shift 2
      ;;
    --swappiness)
      [[ $# -ge 2 ]] || { echo "--swappiness requires a value" >&2; exit 1; }
      SWAPPINESS="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      show_help
      exit 1
      ;;
  esac
done

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "This script must run as root (use sudo)." >&2
  exit 1
fi

if [[ ! -d "$(dirname "$SWAPFILE")" ]]; then
  echo "Swap file directory does not exist: $(dirname "$SWAPFILE")" >&2
  exit 1
fi

if swapon --show=NAME | grep -Fxq "$SWAPFILE"; then
  if [[ $FORCE -eq 0 ]]; then
    echo "Swap already active at $SWAPFILE; nothing to do. Use --force to recreate." >&2
    exit 0
  fi
  swapoff "$SWAPFILE"
fi

if [[ -f "$SWAPFILE" ]]; then
  rm -f "$SWAPFILE"
fi

if command -v fallocate >/dev/null 2>&1; then
  fallocate -l "$SIZE" "$SWAPFILE"
else
  if ! command -v numfmt >/dev/null 2>&1; then
    echo "numfmt is required when fallocate is unavailable." >&2
    exit 1
  fi
  SIZE_BYTES=$(numfmt --from=iec "$SIZE")
  COUNT=$(((SIZE_BYTES + 1048575) / 1048576))
  (( COUNT > 0 )) || { echo "Swap size must be at least 1M." >&2; exit 1; }
  dd if=/dev/zero of="$SWAPFILE" bs=1M count="$COUNT" status=progress
fi

chmod 600 "$SWAPFILE"
mkswap "$SWAPFILE"
swapon "$SWAPFILE"

grep -q "^$SWAPFILE " /etc/fstab || \
  printf '%s\n' "$SWAPFILE swap swap defaults 0 0" >> /etc/fstab

SYSCTL_FILE="/etc/sysctl.d/99-asm3-swap.conf"
printf 'vm.swappiness=%s\n' "$SWAPPINESS" > "$SYSCTL_FILE"
sysctl -p "$SYSCTL_FILE" >/dev/null

echo "Swap enabled at $SWAPFILE ($SIZE, vm.swappiness=$SWAPPINESS)."
