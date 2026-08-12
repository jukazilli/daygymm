variable "project_id" {
  type        = string
  description = "Google Cloud host project receiving the approved DayGym APIs."
}

variable "services" {
  type        = set(string)
  description = "Exact Google APIs approved for the DayGym staging foundation."
}
