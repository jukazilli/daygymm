terraform {
  backend "gcs" {
    bucket = "daygym-tfstate-staging-101192507609"
    prefix = "foundation"
  }
}
