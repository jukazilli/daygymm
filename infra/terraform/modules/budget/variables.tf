variable "billing_account_id" {
  type        = string
  sensitive   = true
  description = "Billing account ID supplied outside version control."
}

variable "display_name" {
  type        = string
  description = "Budget display name."
}

variable "application_label" {
  type        = string
  description = "Application label that scopes this shared-project budget."
}

variable "currency_code" {
  type        = string
  description = "ISO 4217 billing currency."
}

variable "monthly_amount" {
  type        = number
  description = "Authorized monthly alert amount. This is not a hard spending cap."
}
