#!/usr/bin/env python3

import argparse
import os
import sys
import types


def _install_module_shims() -> None:
    """Provide lightweight stand-ins for optional dependencies.

    These imports are pulled in transitively when we load asm3 for schema
    generation. The schema tool itself does not exercise their functionality,
    so we can safely supply minimal shims that fail lazily if used.
    """

    # Python 3.13 removed the stdlib cgi module. Some asm3 imports
    # (web062.webapi) still expect it to exist.
    try:  # pragma: no cover - shim only for 3.13+
        import cgi  # type: ignore  # noqa: F401
    except ModuleNotFoundError:  # pragma: no cover - executed on Python 3.13+
        shim = types.ModuleType("cgi")

        class _DummyFieldStorage:
            def __init__(self, *args, **kwargs):
                self.list = []
                self.filename = None
                self.value = ""

            def __iter__(self):
                return iter(self.list)

            def __getitem__(self, key):
                raise KeyError(key)

        shim.FieldStorage = _DummyFieldStorage  # type: ignore[attr-defined]
        sys.modules["cgi"] = shim

    # Provide a light-weight Pillow stub when the package is absent.
    try:  # pragma: no cover - prefer real Pillow when available
        import PIL  # type: ignore  # noqa: F401
    except ModuleNotFoundError:  # pragma: no cover - executed when Pillow missing
        pil_stub = types.ModuleType("PIL")
        pil_image = types.ModuleType("PIL.Image")
        pil_font = types.ModuleType("PIL.ImageFont")
        pil_draw = types.ModuleType("PIL.ImageDraw")

        class _PILUnavailable:
            def __getattr__(self, name):
                raise RuntimeError(
                    "Pillow is required for this operation but is not installed."
                )

        pil_image.Image = _PILUnavailable()
        pil_font.ImageFont = _PILUnavailable()
        pil_draw.ImageDraw = _PILUnavailable()

        pil_stub.Image = pil_image
        pil_stub.ImageFont = pil_font
        pil_stub.ImageDraw = pil_draw

        sys.modules["PIL"] = pil_stub
        sys.modules["PIL.Image"] = pil_image
        sys.modules["PIL.ImageFont"] = pil_font
        sys.modules["PIL.ImageDraw"] = pil_draw

    # requests is only used for outbound HTTP helpers; stub it to avoid
    # requiring the dependency locally.
    try:  # pragma: no cover - prefer real requests when available
        import requests  # type: ignore  # noqa: F401
    except ModuleNotFoundError:  # pragma: no cover - executed when requests missing
        requests_stub = types.ModuleType("requests")

        class _RequestsUnavailable:
            def __call__(self, *args, **kwargs):
                raise RuntimeError(
                    "requests is required for this operation but is not installed."
                )

            def __getattr__(self, name):
                raise RuntimeError(
                    "requests is required for this operation but is not installed."
                )

        def _raise(*args, **kwargs):
            raise RuntimeError(
                "requests is required for this operation but is not installed."
            )

        requests_stub.Session = _RequestsUnavailable
        requests_stub.get = requests_stub.post = requests_stub.put = _raise
        requests_stub.delete = requests_stub.head = requests_stub.patch = _raise

        exc_mod = types.ModuleType("requests.exceptions")

        class RequestException(RuntimeError):
            pass

        exc_mod.RequestException = RequestException
        requests_stub.exceptions = exc_mod

        sys.modules["requests"] = requests_stub
        sys.modules["requests.exceptions"] = exc_mod


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate asm3 schema SQLite DB")
    parser.add_argument(
        "--output",
        default=os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "schema.db"
        ),
        help="Path to write the generated SQLite schema database",
    )
    parser.add_argument(
        "--alias",
        default="SQLITE",
        help="Database alias to build (default: SQLITE)",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    _install_module_shims()
    path = os.path.dirname(os.path.abspath(__file__)) + os.sep
    src_path = path + "../../src/"

    sys.path.append(path)
    sys.path.append(src_path)

    import asm3.db  # noqa: E402

    db_path = os.path.abspath(args.output)

    try:
        os.unlink(db_path)
    except FileNotFoundError:
        pass

    dbo = asm3.db.get_dbo(args.alias)
    dbo.database = db_path
    dbo.installpath = src_path
    asm3.dbupdate.install_db_structure(dbo)
    asm3.dbupdate.install_db_views(dbo)


if __name__ == "__main__":
    main()
