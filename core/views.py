from datetime import timedelta

from django.db.models import Sum
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from core.forms import LedgerEntryForm
from core.models import Entity, JobRun, LedgerEntry, Observation
from core.scheduler import REGISTRY, run_job_now


def _last_success(job_name):
    return (
        JobRun.objects.filter(job_name=job_name, status=JobRun.STATUS_SUCCESS)
        .order_by("-finished_at", "-pk")
        .first()
    )


def _job_warnings(now):
    warnings = []
    for job in REGISTRY.values():
        last_success = _last_success(job.name)
        last_success_at = last_success.finished_at if last_success else None
        if last_success_at is None or now - last_success_at > timedelta(seconds=job.max_age_seconds):
            warnings.append({"job": job, "last_success_at": last_success_at})
    return warnings


def dashboard(request):
    now = timezone.now()
    balances = (
        LedgerEntry.objects.values("entity_id", "entity__name")
        .annotate(balance_minor=Sum("amount_minor"))
        .order_by("entity__name")
    )
    keys = Observation.objects.order_by("key").values_list("key", flat=True).distinct()
    observations = [
        Observation.objects.filter(key=key).order_by("-observed_at", "-pk").first() for key in keys
    ]
    recent_runs = JobRun.objects.order_by("-started_at", "-pk")[:10]
    return render(
        request,
        "core/dashboard.html",
        {
            "balances": balances,
            "observations": observations,
            "recent_runs": recent_runs,
            "warnings": _job_warnings(now),
            "now": now,
        },
    )


def _panel_context(entity, form):
    return {
        "entity": entity,
        "form": form,
        "entries": entity.ledger_entries.order_by("-occurred_at", "-pk")[:50],
    }


def entity_detail(request, pk):
    entity = get_object_or_404(Entity, pk=pk)
    if request.method == "POST":
        form = LedgerEntryForm(request.POST)
        if form.is_valid():
            LedgerEntry.objects.create(
                entity=entity,
                occurred_at=timezone.now(),
                description=form.cleaned_data["description"],
                amount_minor=form.cleaned_data["amount_minor"],
            )
            form = LedgerEntryForm()
        return render(request, "core/_entity_panel.html", _panel_context(entity, form))
    return render(request, "core/entity_detail.html", _panel_context(entity, LedgerEntryForm()))


def jobs(request):
    now = timezone.now()
    rows = []
    for job in REGISTRY.values():
        last_run = JobRun.objects.filter(job_name=job.name).order_by("-started_at", "-pk").first()
        last_success = _last_success(job.name)
        last_success_at = last_success.finished_at if last_success else None
        stale = last_success_at is None or now - last_success_at > timedelta(seconds=job.max_age_seconds)
        rows.append(
            {
                "job": job,
                "last_run": last_run,
                "last_success_at": last_success_at,
                "stale": stale,
            }
        )
    return render(request, "core/jobs.html", {"rows": rows, "now": now})


def job_run(request, name):
    if name not in REGISTRY:
        raise Http404(f"unknown job: {name}")
    if request.method == "POST":
        run_job_now(name)
    return redirect("core:jobs")
