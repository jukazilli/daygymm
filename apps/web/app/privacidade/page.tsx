import { LegalNotice } from "../ui/legal-notice";

export default function PrivacyPage() {
  return (
    <LegalNotice title="Aviso de privacidade do teste">
      <p>
        Use apenas um e-mail sintético. Não informe nome, saúde, treino ou outro
        dado pessoal real nesta prévia interna.
      </p>
      <p>
        O DayGym registra apenas a conta de teste, a declaração 18+ e a versão
        destes documentos para validar o fluxo técnico.
      </p>
    </LegalNotice>
  );
}
