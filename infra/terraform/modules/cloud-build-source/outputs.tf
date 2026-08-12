output "bucket_name" {
  value       = google_storage_bucket.source.name
  description = "Private bucket used only to stage DayGym Cloud Build source archives."
}
