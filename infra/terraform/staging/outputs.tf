output "artifact_repository_url" {
  value       = module.artifact_registry.repository_url
  description = "Docker repository URL for immutable DayGym images."
}

output "github_deploy_service_account" {
  value       = module.service_accounts.github_deploy_email
  description = "Keyless GitHub deployment identity."
}

output "cloud_build_service_account" {
  value       = module.service_accounts.cloud_build_email
  description = "Least-privilege identity used by Cloud Build."
}

output "cloud_build_source_bucket" {
  value       = module.cloud_build_source.bucket_name
  description = "Private source staging bucket for Cloud Build."
}

output "workload_identity_provider" {
  value       = module.workload_identity.provider_name
  description = "Workload Identity provider for GitHub Actions."
}

output "secret_containers" {
  value       = module.secrets.secret_ids
  description = "Secret containers created without values."
}
