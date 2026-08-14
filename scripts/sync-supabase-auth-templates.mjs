import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF;

if (!accessToken || !projectRef) {
  throw new Error(
    "SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required.",
  );
}

const [confirmation, recovery] = await Promise.all([
  readFile(resolve("supabase/templates/confirmation.html"), "utf8"),
  readFile(resolve("supabase/templates/recovery.html"), "utf8"),
]);

const expected = {
  mailer_subjects_confirmation: "Confirme seu e-mail no DayGym",
  mailer_subjects_recovery: "Redefina sua senha no DayGym",
  mailer_templates_confirmation_content: confirmation,
  mailer_templates_recovery_content: recovery,
};
const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`;
const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

const update = await fetch(endpoint, {
  method: "PATCH",
  headers,
  body: JSON.stringify(expected),
});
if (!update.ok) {
  throw new Error(`Supabase Auth template update failed (${update.status}).`);
}

const verification = await fetch(endpoint, { headers });
if (!verification.ok) {
  throw new Error(
    `Supabase Auth template verification failed (${verification.status}).`,
  );
}

const current = await verification.json();
const differs = Object.entries(expected).some(
  ([key, value]) => current[key] !== value,
);
if (differs) {
  throw new Error("Supabase Auth templates differ after the update.");
}

console.log(
  "Supabase Auth confirmation and recovery templates are synchronized.",
);
