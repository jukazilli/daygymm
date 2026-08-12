variable "project_id" {
  type        = string
  description = "Google Cloud host project ID."
}

variable "project_number" {
  type        = string
  description = "Google Cloud project number used to make the bucket globally unique."
}

variable "region" {
  type        = string
  description = "Region for the Cloud Build source staging bucket."
}

variable "build_service_account_email" {
  type        = string
  description = "Service account that reads staged source archives."
}

variable "submitter_service_account_email" {
  type        = string
  description = "Federated deployment service account that uploads staged source archives."
}

variable "labels" {
  type        = map(string)
  description = "Ownership labels attached to the bucket."
  default     = {}
}
