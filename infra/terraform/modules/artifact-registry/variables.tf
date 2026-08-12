variable "project_id" {
  type        = string
  description = "Google Cloud host project ID."
}

variable "region" {
  type        = string
  description = "Artifact Registry region."
}

variable "repository_id" {
  type        = string
  description = "Docker repository identifier."
}

variable "labels" {
  type        = map(string)
  description = "Ownership labels attached to the repository."
  default     = {}
}
