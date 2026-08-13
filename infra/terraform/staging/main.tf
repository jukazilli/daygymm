data "google_project" "current" {
  project_id = var.project_id
}

locals {
  labels = {
    application = "daygym"
    environment = "staging"
    managed_by  = "terraform"
  }

  foundation_services = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
  ])

  secret_ids = toset([
    "daygym-database-migration-url",
    "daygym-database-url",
  ])
}

module "project_services" {
  source = "../modules/project-services"

  project_id = var.project_id
  services   = local.foundation_services
}

module "artifact_registry" {
  source = "../modules/artifact-registry"

  project_id    = var.project_id
  region        = var.region
  repository_id = "daygym-containers"
  labels        = local.labels

  depends_on = [module.project_services]
}

module "service_accounts" {
  source = "../modules/service-accounts"

  project_id = var.project_id

  depends_on = [module.project_services]
}

module "cloud_build_source" {
  source = "../modules/cloud-build-source"

  project_id                      = var.project_id
  project_number                  = data.google_project.current.number
  region                          = var.region
  build_service_account_email     = module.service_accounts.cloud_build_email
  submitter_service_account_email = module.service_accounts.github_deploy_email
  labels                          = local.labels

  depends_on = [module.project_services]
}

module "workload_identity" {
  source = "../modules/workload-identity"

  project_id                  = var.project_id
  github_repository           = var.github_repository
  deploy_service_account_name = module.service_accounts.github_deploy_name

  depends_on = [module.project_services]
}

module "secrets" {
  source = "../modules/secrets"

  project_id = var.project_id
  secret_ids = local.secret_ids
  labels     = local.labels

  depends_on = [module.project_services]
}

resource "google_secret_manager_secret_iam_member" "worker_database_accessor" {
  project   = var.project_id
  secret_id = "daygym-database-url"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${module.service_accounts.worker_email}"

  depends_on = [module.secrets]
}

module "budget" {
  source = "../modules/budget"

  billing_account_id = var.billing_account_id
  display_name       = "daygym-staging-monthly-budget"
  application_label  = local.labels.application
  currency_code      = "BRL"
  monthly_amount     = var.monthly_budget_brl

  depends_on = [module.project_services]
}
