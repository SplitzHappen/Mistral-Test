from datetime import datetime, timedelta, timezone as dt_timezone

import pytest
from django.db import IntegrityError, transaction

from core import scheduler
from core.models import JobRun, Observation
from core.scheduler import Job, run_due_jobs, run_job_now, slot_for

NOW = datetime(2025, 6, 1, 12, 0, 0, tzinfo=dt_timezone.utc)


@pytest.fixture
def registry():
    saved = dict(scheduler.REGISTRY)
    scheduler.REGISTRY.clear()
    yield scheduler.REGISTRY
    scheduler.REGISTRY.clear()
    scheduler.REGISTRY.update(saved)


@pytest.mark.django_db
def test_slot_floors_to_interval_since_epoch():
    now = datetime(2025, 6, 1, 12, 3, 45, tzinfo=dt_timezone.utc)
    assert slot_for(now, 60) == datetime(2025, 6, 1, 12, 3, 0, tzinfo=dt_timezone.utc)
    assert slot_for(now, 3600) == datetime(2025, 6, 1, 12, 0, 0, tzinfo=dt_timezone.utc)


@pytest.mark.django_db
def test_failure_recorded_and_next_job_still_runs(registry):
    calls = []

    def bad(now):
        raise RuntimeError("boom")

    def good(now):
        calls.append(now)
        Observation.objects.create(key="k", value_minor=1, observed_at=now)

    registry["bad"] = Job("bad", 60, 300, bad)
    registry["good"] = Job("good", 60, 300, good)

    run_due_jobs(NOW)

    bad_run = JobRun.objects.get(job_name="bad")
    good_run = JobRun.objects.get(job_name="good")
    assert bad_run.status == "failed"
    assert "RuntimeError: boom" in bad_run.error
    assert bad_run.started_at == NOW and bad_run.finished_at == NOW
    assert good_run.status == "success" and good_run.error == ""
    assert calls == [NOW]
    assert Observation.objects.filter(key="k").count() == 1


@pytest.mark.django_db
def test_re_running_a_slot_never_duplicates(registry):
    registry["j"] = Job("j", 60, 300, lambda now: None)
    run_due_jobs(NOW)
    run_due_jobs(NOW)
    run_due_jobs(NOW + timedelta(seconds=30))
    assert JobRun.objects.filter(job_name="j").count() == 1
    run_due_jobs(NOW + timedelta(seconds=61))
    assert JobRun.objects.filter(job_name="j").count() == 2


@pytest.mark.django_db
def test_abandoned_running_row_marked_failed_on_next_pass(registry):
    registry["j"] = Job("j", 60, 300, lambda now: None)
    stale_started = NOW - timedelta(minutes=11)
    stale_slot = slot_for(stale_started, 60)
    JobRun.objects.create(job_name="j", scheduled_for=stale_slot, started_at=stale_started, status="running")

    run_due_jobs(NOW)

    stale = JobRun.objects.get(job_name="j", scheduled_for=stale_slot)
    assert stale.status == "failed"
    assert "abandoned" in stale.error
    assert stale.finished_at == NOW
    assert JobRun.objects.filter(
        job_name="j", scheduled_for=slot_for(NOW, 60), status="success"
    ).exists()


@pytest.mark.django_db
def test_manual_run_uses_now_as_scheduled_for(registry):
    registry["j"] = Job("j", 60, 300, lambda now: None)
    run = run_job_now("j", now=NOW)
    assert run.scheduled_for == NOW
    assert run.status == "success"
    with pytest.raises(ValueError):
        run_job_now("does_not_exist", now=NOW)


@pytest.mark.django_db
def test_jobrun_unique_constraint_on_job_and_slot():
    JobRun.objects.create(job_name="x", scheduled_for=NOW, started_at=NOW, status="running")
    with pytest.raises(IntegrityError), transaction.atomic():
        JobRun.objects.create(job_name="x", scheduled_for=NOW, started_at=NOW, status="running")
