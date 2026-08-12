resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account_id
  display_name    = var.display_name

  budget_filter {
    calendar_period = "MONTH"
    labels = {
      application = var.application_label
    }
  }

  amount {
    specified_amount {
      currency_code = var.currency_code
      units         = tostring(var.monthly_amount)
    }
  }

  dynamic "threshold_rules" {
    for_each = toset([0.5, 0.8, 1.0])

    content {
      spend_basis       = "CURRENT_SPEND"
      threshold_percent = threshold_rules.value
    }
  }

}
