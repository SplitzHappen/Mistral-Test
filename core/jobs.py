from core.models import Observation
from core.scheduler import Job, register


def write_observation(now):
    Observation.objects.create(
        key="heartbeat",
        value_minor=int(now.timestamp()) % 100000,
        observed_at=now,
    )


def failing_job(now):
    raise RuntimeError("intentional sample failure")


register(Job(name="write_observation", interval_seconds=60, max_age_seconds=300, func=write_observation))
register(Job(name="failing_job", interval_seconds=60, max_age_seconds=120, func=failing_job))
