resource "google_service_account" "api" {
  project      = var.project_id
  account_id   = "daygym-api-runtime"
  display_name = "DayGym API runtime"
  description  = "Runtime identity for the public DayGym staging API"
}

resource "google_service_account" "worker" {
  project      = var.project_id
  account_id   = "daygym-worker-runtime"
  display_name = "DayGym worker runtime"
  description  = "Runtime identity for the private DayGym staging worker"
}

resource "google_service_account" "github_deploy" {
  project      = var.project_id
  account_id   = "daygym-github-deploy"
  display_name = "DayGym GitHub deploy"
  description  = "Keyless DayGym deployment identity federated from GitHub Actions"
}

resource "google_service_account" "cloud_build" {
  project      = var.project_id
  account_id   = "daygym-cloud-build"
  display_name = "DayGym Cloud Build"
  description  = "Least-privilege identity for building and publishing DayGym images"
}

locals {
  deploy_project_roles = toset([
    "roles/artifactregistry.writer",
    "roles/cloudbuild.builds.editor",
    "roles/run.developer",
    "roles/serviceusage.serviceUsageConsumer",
  ])

  cloud_build_project_roles = toset([
    "roles/artifactregistry.writer",
    "roles/logging.logWriter",
  ])
}

resource "google_project_iam_member" "github_deploy" {
  for_each = local.deploy_project_roles

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_project_iam_member" "cloud_build" {
  for_each = local.cloud_build_project_roles

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloud_build.email}"
}

resource "google_service_account_iam_member" "github_can_use_cloud_build" {
  service_account_id = google_service_account.cloud_build.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_service_account_iam_member" "github_can_use_api_runtime" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_service_account_iam_member" "github_can_use_worker_runtime" {
  service_account_id = google_service_account.worker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deploy.email}"
}
