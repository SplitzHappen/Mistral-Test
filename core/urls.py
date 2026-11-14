from django.urls import path

from core import views

app_name = "core"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("entities/<int:pk>/", views.entity_detail, name="entity_detail"),
    path("jobs/", views.jobs, name="jobs"),
    path("jobs/<str:name>/run/", views.job_run, name="job_run"),
]
