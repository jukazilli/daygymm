import { MobileLegalScreen } from "./ui/mobile-legal-screen";

const paragraphs = [
  "Esta versão existe somente para validar contas sintéticas no ambiente interno do DayGym. Não use dados pessoais reais.",
  "O acesso pode ser interrompido e os dados de teste podem ser removidos durante a evolução do produto.",
] as const;

export default function TermsScreen() {
  return <MobileLegalScreen paragraphs={paragraphs} title="Termos de teste" />;
}
