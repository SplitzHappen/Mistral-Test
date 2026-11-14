from django.db import models


class Entity(models.Model):
    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=100)

    class Meta:
        ordering = ["name", "pk"]

    def __str__(self):
        return self.name


class LedgerEntry(models.Model):
    entity = models.ForeignKey(Entity, on_delete=models.CASCADE, related_name="ledger_entries")
    occurred_at = models.DateTimeField()
    description = models.CharField(max_length=255)
    amount_minor = models.IntegerField()

    class Meta:
        ordering = ["-occurred_at", "-pk"]
        indexes = [models.Index(fields=["entity", "-occurred_at"])]

    def __str__(self):
        return f"{self.entity_id}: {self.description} ({self.amount_minor})"


class Observation(models.Model):
    key = models.CharField(max_length=100)
    value_minor = models.IntegerField()
    observed_at = models.DateTimeField()

    class Meta:
        ordering = ["-observed_at", "-pk"]
        indexes = [models.Index(fields=["key", "-observed_at"])]

    def __str__(self):
        return f"{self.key}={self.value_minor} @ {self.observed_at}"


class JobRun(models.Model):
    STATUS_RUNNING = "running"
    STATUS_SUCCESS = "success"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_RUNNING, "running"),
        (STATUS_SUCCESS, "success"),
        (STATUS_FAILED, "failed"),
    ]

    job_name = models.CharField(max_length=100)
    scheduled_for = models.DateTimeField()
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_RUNNING)
    error = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-started_at", "-pk"]
        constraints = [
            models.UniqueConstraint(fields=["job_name", "scheduled_for"], name="unique_job_slot"),
        ]

    def __str__(self):
        return f"{self.job_name} @ {self.scheduled_for} [{self.status}]"
