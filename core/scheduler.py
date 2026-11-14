import traceback
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from django.utils import timezone as dj_timezone

from core.models import JobRun

ABANDONED_AFTER = timedelta(minutes=10)


@dataclass(frozen=True)
class Job:
    name: str
    interval_seconds: int
    max_age_seconds: int
    func: object


REGISTRY: dict[str, Job] = {}


def register(job: Job) -> Job:
    REGISTRY[job.name] = job
    return job


def _as_aware(now: datetime) -> datetime:
    if dj_timezone.is_naive(now):
        return dj_timezone.make_aware(now, timezone.utc)
    return now


def slot_for(now: datetime, interval_seconds: int) -> datetime:
    now = _as_aware(now)
    floored = int(now.timestamp() // interval_seconds) * interval_seconds
    return datetime.fromtimestamp(floored, tz=timezone.utc)


def mark_abandoned(now: datetime) -> int:
    now = _as_aware(now)
    cutoff = now - ABANDONED_AFTER
    return JobRun.objects.filter(status=JobRun.STATUS_RUNNING, started_at__lt=cutoff).update(
        status=JobRun.STATUS_FAILED,
        finished_at=now,
        error="abandoned: still running after 10 minutes",
    )


def _execute(job: Job, run: JobRun, now: datetime) -> JobRun:
    try:
        job.func(now)
    except Exception:
        run.status = JobRun.STATUS_FAILED
        run.error = traceback.format_exc()
    else:
        run.status = JobRun.STATUS_SUCCESS
        run.error = ""
    run.finished_at = now
    run.save()
    return run


def run_due_jobs(now: datetime | None = None) -> dict[str, JobRun]:
    now = _as_aware(now or dj_timezone.now())
    mark_abandoned(now)
    results: dict[str, JobRun] = {}
    for name, job in REGISTRY.items():
        slot = slot_for(now, job.interval_seconds)
        existing = JobRun.objects.filter(job_name=name, scheduled_for=slot).first()
        if existing is not None:
            results[name] = existing
            continue
        run = JobRun.objects.create(
            job_name=name,
            scheduled_for=slot,
            started_at=now,
            status=JobRun.STATUS_RUNNING,
        )
        results[name] = _execute(job, run, now)
    return results


def run_job_now(name: str, now: datetime | None = None) -> JobRun:
    if name not in REGISTRY:
        raise ValueError(f"unknown job: {name!r}")
    now = _as_aware(now or dj_timezone.now())
    job = REGISTRY[name]
    run, created = JobRun.objects.get_or_create(
        job_name=name,
        scheduled_for=now,
        defaults={"started_at": now, "status": JobRun.STATUS_RUNNING},
    )
    if not created:
        return run
    return _execute(job, run, now)
