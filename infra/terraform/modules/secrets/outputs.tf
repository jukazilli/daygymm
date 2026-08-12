output "secret_ids" {
  value       = keys(google_secret_manager_secret.container)
  description = "Secret container IDs created without secret values."
}
