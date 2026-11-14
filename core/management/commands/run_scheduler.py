import time

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.scheduler import REGISTRY, run_due_jobs


class Command(BaseCommand):
    help = "Run due jobs; loops forever unless --once is given."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Run a single pass and exit.")

    def handle(self, *args, **options):
        while True:
            run_due_jobs(timezone.now())
            if options["once"]:
                break
            intervals = [job.interval_seconds for job in REGISTRY.values()] or [60]
            time.sleep(max(1, min(min(intervals), 60)))
