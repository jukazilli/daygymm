import { LegalNotice } from "../ui/legal-notice";

export default function TermsPage() {
  return (
    <LegalNotice title="Termos de teste">
      <p>
        Esta versão existe somente para validar contas sintéticas no ambiente
        interno do DayGym. Não use dados pessoais reais.
      </p>
      <p>
        O acesso pode ser interrompido e os dados de teste podem ser removidos
        durante a evolução do produto.
      </p>
    </LegalNotice>
  );
}
