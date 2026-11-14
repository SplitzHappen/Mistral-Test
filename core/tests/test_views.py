import pytest
from django.test import Client
from django.urls import reverse

from core.models import Entity, JobRun, LedgerEntry
from core.scheduler import run_job_now


@pytest.fixture
def entity(db):
    return Entity.objects.create(name="Harbor Co", kind="company")


@pytest.mark.django_db
def test_pages_return_200(entity):
    client = Client()
    assert client.get(reverse("core:dashboard")).status_code == 200
    assert client.get(reverse("core:entity_detail", args=[entity.pk])).status_code == 200
    assert client.get(reverse("core:jobs")).status_code == 200


@pytest.mark.django_db
def test_raising_job_triggers_dashboard_warning():
    run_job_now("write_observation")
    run_job_now("failing_job")
    content = Client().get(reverse("core:dashboard")).content
    assert b"failing_job" in content
    assert b"no success within" in content


@pytest.mark.django_db
def test_valid_post_with_csrf_checks_succeeds(entity):
    client = Client(enforce_csrf_checks=True)
    client.get(reverse("core:entity_detail", args=[entity.pk]))
    token = client.cookies["csrftoken"].value
    response = client.post(
        reverse("core:entity_detail", args=[entity.pk]),
        {"description": "coffee", "amount_minor": "-450"},
        HTTP_X_CSRFTOKEN=token,
    )
    assert response.status_code == 200
    assert LedgerEntry.objects.filter(entity=entity, description="coffee", amount_minor=-450).exists()
    assert b"coffee" in response.content


@pytest.mark.django_db
def test_invalid_post_rerenders_form_with_errors_http_200(entity):
    response = Client().post(
        reverse("core:entity_detail", args=[entity.pk]),
        {"description": "", "amount_minor": "0"},
    )
    assert response.status_code == 200
    assert b"This field is required." in response.content
    assert b"nonzero integer" in response.content
    assert LedgerEntry.objects.count() == 0


@pytest.mark.django_db
def test_run_now_button_runs_job_synchronously():
    response = Client().post(reverse("core:job_run", args=["write_observation"]))
    assert response.status_code == 302
    assert JobRun.objects.filter(job_name="write_observation", status="success").exists()
