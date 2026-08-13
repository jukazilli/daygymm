module "api_service" {
  count = var.provision_cloud_run ? 1 : 0

  source = "../modules/cloud-run-service"

  project_id            = var.project_id
  region                = var.region
  service_name          = "daygym-api-staging"
  description           = "Public DayGym staging API"
  container_image       = var.container_image
  service_account_email = module.service_accounts.api_email
  environment           = "staging"
  process_kind          = "api"
  min_instances         = 0
  max_instances         = 1
  public_access         = true
  labels                = local.labels

  depends_on = [
    module.artifact_registry,
    module.project_services,
  ]
}

module "worker_service" {
  count = var.provision_cloud_run ? 1 : 0

  source = "../modules/cloud-run-service"

  project_id             = var.project_id
  region                 = var.region
  service_name           = "daygym-worker-staging"
  description            = "Private DayGym staging worker"
  container_image        = var.container_image
  service_account_email  = module.service_accounts.worker_email
  environment            = "staging"
  process_kind           = "worker"
  min_instances          = 0
  max_instances          = 1
  public_access          = false
  database_url_secret_id = "daygym-database-url"
  labels                 = local.labels

  depends_on = [
    module.artifact_registry,
    module.project_services,
  ]
}
