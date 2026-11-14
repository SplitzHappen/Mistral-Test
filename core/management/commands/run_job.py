from django.core.management.base import BaseCommand, CommandError

from core.scheduler import run_job_now


class Command(BaseCommand):
    help = "Run a single registered job immediately (scheduled_for=now)."

    def add_arguments(self, parser):
        parser.add_argument("name", help="Registered job name.")

    def handle(self, *args, **options):
        try:
            run = run_job_now(options["name"])
        except ValueError as exc:
            raise CommandError(str(exc))
        self.stdout.write(f"{run.job_name} -> {run.status}")
        if run.error:
            self.stdout.write(run.error)
        if run.status == "failed":
            raise CommandError(f"job {run.job_name} failed")
