variable "project_id" {
  type        = string
  description = "Google Cloud host project ID."
}

variable "github_repository" {
  type        = string
  description = "Exact GitHub owner/repository allowed to federate."
}

variable "deploy_service_account_name" {
  type        = string
  description = "Fully qualified GitHub deploy service-account resource name."
}
