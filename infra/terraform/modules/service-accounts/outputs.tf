output "api_email" {
  value       = google_service_account.api.email
  description = "API runtime service-account email."
}

output "worker_email" {
  value       = google_service_account.worker.email
  description = "Worker runtime service-account email."
}

output "github_deploy_email" {
  value       = google_service_account.github_deploy.email
  description = "GitHub deployment service-account email."
}

output "github_deploy_name" {
  value       = google_service_account.github_deploy.name
  description = "Fully qualified GitHub deployment service-account name."
}

output "cloud_build_email" {
  value       = google_service_account.cloud_build.email
  description = "Least-privilege Cloud Build service-account email."
}
