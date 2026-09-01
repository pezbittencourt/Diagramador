import { randomBytes } from "node:crypto";
import { PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";

/**
 * Identificador ICC padrão para o perfil sRGB IEC61966-2.1 embutido
 * (`build/sRGB.icc`, littleCMS, licença zlib). Ver THIRD_PARTY_NOTICES.txt.
 */
const OUTPUT_CONDITION_IDENTIFIER = "sRGB IEC61966-2.1";
const OUTPUT_CONDITION_INFO = "sRGB IEC61966-2.1 (littleCMS)";
const REGISTRY_NAME = "http://www.color.org";
const PDFX_VERSION = "PDF/X-4";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildXmpPacket(title: string, producer: string): string {
  const safeTitle = escapeXml(title);
  const safeProducer = escapeXml(producer);
  return [
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about=""',
    '    xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/"',
    '    xmlns:pdf="http://ns.adobe.com/pdf/1.3/"',
    '    xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '    xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
    `  <pdfxid:GTS_PDFXVersion>${PDFX_VERSION}</pdfxid:GTS_PDFXVersion>`,
    "  <pdf:Trapped>False</pdf:Trapped>",
    "  <dc:format>application/pdf</dc:format>",
    `  <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${safeTitle}</rdf:li></rdf:Alt></dc:title>`,
    `  <xmp:CreatorTool>${safeProducer}</xmp:CreatorTool>`,
    `  <pdf:Producer>${safeProducer}</pdf:Producer>`,
    "</rdf:Description>",
    "</rdf:RDF>",
    "</x:xmpmeta>",
    '<?xpacket end="w"?>',
  ].join("\n");
}

/**
 * Aplica identificação PDF/X-4 ao documento mesclado: output intent com o
 * perfil ICC sRGB embutido, metadados XMP (`pdfxid:GTS_PDFXVersion`) e um
 * identificador de arquivo (`/ID`) no trailer. Mantém o pipeline em RGB —
 * o Chromium não produz CMYK nativamente — declarando explicitamente a
 * condição de saída em vez de deixar o perfil de cor implícito.
 *
 * Isto cobre a identificação PDF/X-4 e o gerenciamento de cor por ICC; não
 * substitui uma verificação formal de conformidade (preflight) contra a
 * norma ISO 15930-7.
 */
export function applyPdfXOutputIntent(
  document: PDFDocument,
  iccProfile: Uint8Array,
  title: string,
  producer: string,
): void {
  const { context } = document;

  const profileStream = context.flateStream(iccProfile, {
    N: 3,
    Alternate: PDFName.of("DeviceRGB"),
  });
  const profileRef = context.register(profileStream);

  const outputIntent = context.obj({
    Type: "OutputIntent",
    S: "GTS_PDFX",
    OutputConditionIdentifier: PDFString.of(OUTPUT_CONDITION_IDENTIFIER),
    OutputCondition: PDFString.of(OUTPUT_CONDITION_INFO),
    RegistryName: PDFString.of(REGISTRY_NAME),
    Info: PDFString.of(OUTPUT_CONDITION_INFO),
    DestOutputProfile: profileRef,
  });
  const outputIntentRef = context.register(outputIntent);
  document.catalog.set(PDFName.of("OutputIntents"), context.obj([outputIntentRef]));

  const xmpBytes = Buffer.from(buildXmpPacket(title, producer), "utf8");
  const metadataStream = context.stream(xmpBytes, {
    Type: "Metadata",
    Subtype: "XML",
  });
  const metadataRef = context.register(metadataStream);
  document.catalog.set(PDFName.of("Metadata"), metadataRef);

  const fileId = PDFHexString.of(randomBytes(16).toString("hex").toUpperCase());
  context.trailerInfo.ID = context.obj([fileId, fileId]);
}
