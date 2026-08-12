resource "google_storage_bucket" "source" {
  project                     = var.project_id
  name                        = "daygym-build-source-${var.project_number}"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  labels = var.labels

  lifecycle_rule {
    condition {
      age = 7
    }

    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket_iam_member" "build_can_read" {
  bucket = google_storage_bucket.source.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${var.build_service_account_email}"
}

resource "google_storage_bucket_iam_member" "submitter_can_write" {
  bucket = google_storage_bucket.source.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${var.submitter_service_account_email}"
}

resource "google_storage_bucket_iam_member" "submitter_can_inspect_bucket" {
  bucket = google_storage_bucket.source.name
  role   = "roles/storage.bucketViewer"
  member = "serviceAccount:${var.submitter_service_account_email}"
}
