variable "project_id" {
  type        = string
  description = "Google Cloud host project ID."
}

variable "region" {
  type        = string
  description = "Cloud Run service region."
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name."
}

variable "description" {
  type        = string
  description = "Human-readable service purpose."
}

variable "container_image" {
  type        = string
  description = "Immutable Artifact Registry image reference used for the initial revision."
}

variable "service_account_email" {
  type        = string
  description = "Dedicated runtime service-account email."
}

variable "environment" {
  type        = string
  description = "DayGym environment identifier."
}

variable "process_kind" {
  type        = string
  description = "Runtime process boundary hosted by the service."

  validation {
    condition     = contains(["api", "worker"], var.process_kind)
    error_message = "process_kind must be api or worker."
  }
}

variable "min_instances" {
  type        = number
  description = "Minimum automatic instance count."
}

variable "max_instances" {
  type        = number
  description = "Maximum automatic instance count."
}

variable "public_access" {
  type        = bool
  description = "Whether to disable the Cloud Run invoker IAM check."
}

variable "labels" {
  type        = map(string)
  description = "Ownership labels attached to the Cloud Run service."
  default     = {}
}
