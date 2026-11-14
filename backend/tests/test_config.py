"""Settings: blank values (as copied from .env.example) fall back to the defaults (SPEC §11)."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings

ROOT = Path(__file__).resolve().parents[2]


def _example_names(path: Path) -> list[str]:
    return [line.split("=", 1)[0] for line in path.read_text().splitlines() if line and line[0].isupper() and "=" in line]


def test_blank_values_use_defaults(monkeypatch):
    for name in _example_names(ROOT / ".env.example"):
        monkeypatch.setenv(name, "")
    monkeypatch.setenv("JWT_SECRET_KEY", "x" * 40)
    s = Settings(_env_file=None)
    assert s.ACCESS_TOKEN_EXPIRE_MINUTES == 720 and s.BCRYPT_ROUNDS == 12 and s.OPENAI_API_KEY is None
    assert s.REMINDER_THRESHOLD_MINUTES == 15 and s.LOGIN_RATE_LIMIT == 10 and s.APP_TIMEZONE == "Asia/Kolkata"


def test_jwt_secret_is_required(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_examples_list_every_setting_without_values():
    settings = set(Settings.model_fields)
    for path in (ROOT / ".env.example", ROOT / "backend" / ".env.example"):
        names = _example_names(path)
        missing = settings - set(names) - {"DATABASE_URL"}  # compose builds DATABASE_URL in the root setup
        assert not missing, (path.name, missing)
        assert all(line.endswith("=") for line in path.read_text().splitlines() if line and line[0].isupper())
