resource "google_cloud_run_v2_service_iam_member" "worker_scheduler_invoker" {
  count = var.provision_cloud_run ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = module.worker_service[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${module.service_accounts.worker_scheduler_email}"
}

resource "google_cloud_scheduler_job" "domain_events" {
  count = var.provision_cloud_run ? 1 : 0

  project          = var.project_id
  region           = var.region
  name             = "daygym-domain-events-staging"
  description      = "Runs one bounded DayGym domain-event worker cycle."
  schedule         = "* * * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "30s"
  paused           = false

  http_target {
    http_method = "POST"
    uri         = "${module.worker_service[0].uri}/internal/jobs/domain-events"
    body        = base64encode("{}")

    headers = {
      "Content-Type" = "application/json"
    }

    oidc_token {
      service_account_email = module.service_accounts.worker_scheduler_email
      audience              = module.worker_service[0].uri
    }
  }

  depends_on = [
    google_cloud_run_v2_service_iam_member.worker_scheduler_invoker,
    module.project_services,
  ]
}
