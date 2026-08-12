variable "project_id" {
  type        = string
  description = "Google Cloud host project ID."
}

variable "secret_ids" {
  type        = set(string)
  description = "Secret container IDs. Values are inserted by a separate secure flow."
}

variable "labels" {
  type        = map(string)
  description = "Ownership labels attached to secret containers."
  default     = {}
}
