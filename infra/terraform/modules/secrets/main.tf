resource "google_secret_manager_secret" "container" {
  for_each = var.secret_ids

  project   = var.project_id
  secret_id = each.value

  labels = var.labels

  replication {
    auto {}
  }
}
