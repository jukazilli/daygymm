import type { ReactNode } from "react";

export function LegalNotice({
  children,
  title,
}: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <main className="legal-shell">
      <article className="legal-content">
        <a className="brand" href="/entrar/">
          DayGym
        </a>
        <p className="eyebrow">Versão de teste · 13/08/2026</p>
        <h1>{title}</h1>
        {children}
        <a className="button-secondary" href="/criar-conta/">
          Voltar para criar conta
        </a>
      </article>
    </main>
  );
}
