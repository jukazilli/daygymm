variable "project_id" {
  type        = string
  description = "Temporary Google Cloud host project for DayGym staging."
  default     = "pex-gsc"
}

variable "region" {
  type        = string
  description = "DayGym staging compute and artifact region."
  default     = "southamerica-east1"
}

variable "github_repository" {
  type        = string
  description = "Exact GitHub repository trusted by WIF."
  default     = "jukazilli/daygymm"
}

variable "billing_account_id" {
  type        = string
  sensitive   = true
  description = "Billing account supplied through TF_VAR_billing_account_id; never commit it."
}

variable "monthly_budget_brl" {
  type        = number
  description = "User-authorized monthly budget alert amount in BRL."
  default     = 50
}

variable "container_image" {
  type        = string
  description = "Immutable Artifact Registry image used for the first Cloud Run revisions."
  default     = ""
}

variable "provision_cloud_run" {
  type        = bool
  description = "Whether to create the Cloud Run services after a verified immutable image exists."
  default     = false
}
