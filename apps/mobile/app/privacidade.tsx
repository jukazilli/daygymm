import { MobileLegalScreen } from "./ui/mobile-legal-screen";

const paragraphs = [
  "Use apenas um e-mail sintético. Não informe nome, saúde, treino ou outro dado pessoal real nesta prévia interna.",
  "O DayGym registra apenas a conta de teste, a declaração 18+ e a versão destes documentos para validar o fluxo técnico.",
] as const;

export default function PrivacyScreen() {
  return (
    <MobileLegalScreen
      paragraphs={paragraphs}
      title="Aviso de privacidade do teste"
    />
  );
}
