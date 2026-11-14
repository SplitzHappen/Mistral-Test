import os
import urllib.parse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "django-insecure-dev-placeholder-not-a-real-secret")
DEBUG = os.environ.get("DEBUG", "True").lower() in ("1", "true", "yes", "on")
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "commandcenter.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.template.context_processors.csrf",
                "django.template.context_processors.static",
            ],
        },
    },
]

WSGI_APPLICATION = "commandcenter.wsgi.application"
ASGI_APPLICATION = "commandcenter.asgi.application"


def _database_from_env():
    url = os.environ.get("DATABASE_URL", "sqlite:///db.sqlite3")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme.startswith("sqlite"):
        path = parsed.path
        if parsed.netloc == ":memory:" or path in ("", "/:memory:"):
            return {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}
        name = path.lstrip("/")
        if not os.path.isabs(name):
            name = str(BASE_DIR / name)
        return {"ENGINE": "django.db.backends.sqlite3", "NAME": name}
    if parsed.scheme in ("postgres", "postgresql"):
        return {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": parsed.path.lstrip("/"),
            "USER": parsed.username or "",
            "PASSWORD": parsed.password or "",
            "HOST": parsed.hostname or "",
            "PORT": str(parsed.port or ""),
        }
    raise ValueError(f"Unsupported DATABASE_URL scheme: {parsed.scheme!r}")


DATABASES = {"default": _database_from_env()}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
