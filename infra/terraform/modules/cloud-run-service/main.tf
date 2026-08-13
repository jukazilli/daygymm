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

    dynamic "volumes" {
      for_each = var.database_url_secret_id == null ? [] : [var.database_url_secret_id]

      content {
        name = "database-url"

        secret {
          secret = volumes.value

          items {
            version = var.database_url_secret_version
            path    = "database-url"
          }
        }
      }
    }

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

      dynamic "env" {
        for_each = var.database_url_secret_id == null ? [] : [1]

        content {
          name  = "DAYGYM_DATABASE_URL_FILE"
          value = "/var/run/secrets/daygym/database-url"
        }
      }

      dynamic "volume_mounts" {
        for_each = var.database_url_secret_id == null ? [] : [1]

        content {
          name       = "database-url"
          mount_path = "/var/run/secrets/daygym"
        }
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
