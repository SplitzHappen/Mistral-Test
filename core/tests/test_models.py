from datetime import datetime, timezone as dt_timezone

import pytest
from django.db.models import Sum

from core.models import Entity, LedgerEntry

T0 = datetime(2025, 1, 1, 12, 0, 0, tzinfo=dt_timezone.utc)


@pytest.mark.django_db
def test_balances_via_aggregation_match_hand_computed():
    harbor = Entity.objects.create(name="Harbor Co", kind="company")
    anna = Entity.objects.create(name="Anna", kind="person")

    LedgerEntry.objects.create(entity=harbor, occurred_at=T0, description="invoice", amount_minor=12500)
    LedgerEntry.objects.create(entity=harbor, occurred_at=T0, description="refund", amount_minor=-2550)
    LedgerEntry.objects.create(entity=harbor, occurred_at=T0, description="fee", amount_minor=-199)
    LedgerEntry.objects.create(entity=anna, occurred_at=T0, description="gift", amount_minor=1000)

    balances = dict(
        LedgerEntry.objects.values_list("entity")
        .annotate(total=Sum("amount_minor"))
        .values_list("entity", "total")
    )

    assert balances[harbor.pk] == 12500 - 2550 - 199
    assert balances[anna.pk] == 1000
    assert LedgerEntry.objects.get(entity=harbor, description="refund").amount_minor == -2550
