import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { strToU8, zipSync } from "fflate";

const outputPath = resolve(
  "public/templates/daygym-modelo-oficial-treino.xlsx",
);

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function worksheet(rows) {
  const sheetData = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          if (value === null || value === "") {
            return "";
          }
          const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
          if (typeof value === "number") {
            return `<c r="${reference}"><v>${value}</v></c>`;
          }
          return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetData}</sheetData>
</worksheet>`;
}

const headers = [
  "Dia",
  "Sessão",
  "Ordem",
  "Exercício",
  "Tipo",
  "Séries",
  "Reps mín",
  "Reps máx",
  "Duração (s)",
  "Distância (m)",
  "Descanso (s)",
  "Circuito",
  "Observações",
  "Carga (kg)",
];

const trainingRows = [
  headers,
  [
    1,
    "Treino A",
    1,
    "Agachamento livre",
    "força",
    3,
    8,
    12,
    null,
    null,
    90,
    null,
    "",
    40,
  ],
  [
    1,
    "Treino A",
    2,
    "Prancha",
    "tempo",
    3,
    null,
    null,
    30,
    null,
    45,
    null,
    "Manter postura",
    null,
  ],
  [
    2,
    "Cardio",
    1,
    "Caminhada",
    "cardio",
    1,
    null,
    null,
    1200,
    null,
    0,
    null,
    "Ritmo confortável",
    null,
  ],
];

const instructionRows = [
  ["Modelo oficial de treino DayGym"],
  ["Preencha somente a aba Treinos. Não altere os títulos da primeira linha."],
  ["Na coluna Dia: 1 é segunda, 2 terça, 3 quarta e assim até 7 domingo."],
  ["Tipos aceitos: força, tempo, distância, cardio e circuito."],
  ["Força exige Reps mín e Reps máx. Tempo exige Duração (s)."],
  ["Distância e cardio exigem Duração (s) ou Distância (m)."],
  ["Circuito exige um nome na coluna Circuito."],
  ["Carga (kg) é opcional e aceita até duas casas decimais."],
  ["O arquivo deve permanecer .xlsx e ter no máximo 2 MB."],
  [
    "Macros, fórmulas, links, proteção e objetos incorporados bloqueiam a importação.",
  ],
];

const files = {
  "[Content_Types].xml":
    strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
  "_rels/.rels":
    strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
  "xl/workbook.xml":
    strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Instruções" sheetId="1" r:id="rId1"/>
    <sheet name="Treinos" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`),
  "xl/_rels/workbook.xml.rels":
    strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`),
  "xl/worksheets/sheet1.xml": strToU8(worksheet(instructionRows)),
  "xl/worksheets/sheet2.xml": strToU8(worksheet(trainingRows)),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  zipSync(files, { level: 6, mtime: new Date("1980-01-02T12:00:00Z") }),
);
