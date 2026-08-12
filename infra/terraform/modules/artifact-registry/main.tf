resource "google_artifact_registry_repository" "containers" {
  project       = var.project_id
  location      = var.region
  repository_id = var.repository_id
  description   = "Immutable DayGym staging application images"
  format        = "DOCKER"

  labels = var.labels

  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"

    condition {
      older_than = "604800s"
      tag_state  = "UNTAGGED"
    }
  }

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }
}
