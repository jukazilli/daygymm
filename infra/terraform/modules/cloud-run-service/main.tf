resource "google_cloud_run_v2_service" "service" {
  project     = var.project_id
  name        = var.service_name
  location    = var.region
  description = var.description

  deletion_protection  = true
  ingress              = var.public_access ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_ONLY"
  invoker_iam_disabled = var.public_access

  labels = merge(var.labels, {
    environment = var.environment
    process     = var.process_kind
  })

  template {
    service_account = var.service_account_email
    timeout         = "60s"

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      name  = var.process_kind
      image = var.container_image

      ports {
        name           = "http1"
        container_port = 8080
      }

      env {
        name  = "DAYGYM_ENV"
        value = var.environment
      }

      env {
        name  = "DAYGYM_PROCESS"
        value = var.process_kind
      }
    }
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].containers[0].image,
    ]
  }
}
