"""Reset an ASM3 user's password from within the container."""

from __future__ import annotations

import sys
from pathlib import Path

SRC_PATH = Path(__file__).resolve().parents[1] / "src"
src_path_str = str(SRC_PATH)
if src_path_str not in sys.path:
    sys.path.insert(0, src_path_str)

import asm3.db  # type: ignore  # noqa: E402
import asm3.users  # type: ignore  # noqa: E402


def main(alias: str, username: str, new_password: str) -> None:
    dbo = asm3.db.get_database(alias)
    if dbo.database in asm3.db.ERROR_VALUES:
        raise RuntimeError(f"Unknown database alias {alias}")

    row = dbo.first_row(dbo.query("SELECT ID FROM users WHERE UserName = ?", [username]))
    if row is None:
        raise RuntimeError(f"User {username} not found in database {alias}")

    asm3.users.reset_password(dbo, row.ID, new_password)
    print(f"Password updated for {username} on {alias}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: reset_password.py <alias> <username> <new_password>")

    _, alias_arg, username_arg, password_arg = sys.argv
    main(alias_arg, username_arg, password_arg)
