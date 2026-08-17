import type { CSSProperties } from "react";
import type { BookDocument, BookPage, PositionedImageObject } from "../domain/document";
import { resolveFacingEdges } from "../domain/pageGeometry";
import { resolvePageNumber } from "../domain/pageNumbering";
import type { LaidOutPage, LayoutSnapshot } from "../layout/layoutTypes";
import { ComposedTextLayer, EditorialFolio } from "./EditorialText";

interface PdfExportDocumentProps {
  exportId: string;
  book: BookDocument;
  pages: BookPage[];
  layout: LayoutSnapshot;
  physicalPageIndexes: number[];
  includeBleed: boolean;
}

const physicalUnits = {
  mm: (value: number) => `${value}mm`,
  pt: (value: number) => `${value}pt`,
};

function dataUrl(mimeType: string, data: string): string {
  return `data:${mimeType};base64,${data}`;
}

function emptyLayoutPage(physicalIndex: number): LaidOutPage {
  return { physicalIndex, fragments: [], usedHeightMm: 0 };
}

export function PdfExportDocument({
  exportId,
  book,
  pages,
  layout,
  physicalPageIndexes,
  includeBleed,
}: PdfExportDocumentProps) {
  const widthMm = book.pageSetup.width
    + (includeBleed ? book.pageSetup.bleed.inner + book.pageSetup.bleed.outer : 0);
  const heightMm = book.pageSetup.height
    + (includeBleed ? book.pageSetup.bleed.top + book.pageSetup.bleed.bottom : 0);
  const assetMap = new Map(book.assets.map((asset) => [asset.id, asset]));

  return (
    <section
      className="pdf-export-root"
      data-pdf-export-id={exportId}
      data-page-count={physicalPageIndexes.length}
      aria-hidden="true"
    >
      <style>{`@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`}</style>
      {physicalPageIndexes.map((physicalIndex, outputIndex) => {
        const page = pages[physicalIndex] ?? { id: `pdf-page-${physicalIndex}`, objects: [] };
        const layoutPage = layout.pages[physicalIndex] ?? emptyLayoutPage(physicalIndex);
        const resolvedBleed = resolveFacingEdges(
          book.pageSetup.bleed,
          physicalIndex,
          book.pageSetup.mirroredMargins,
        );
        const bleed = includeBleed
          ? resolvedBleed
          : { top: 0, right: 0, bottom: 0, left: 0 };
        const folio = resolvePageNumber(page, physicalIndex, book.numbering);
        const pageStyle: CSSProperties = { width: `${widthMm}mm`, height: `${heightMm}mm` };
        const trimStyle: CSSProperties = {
          left: `${bleed.left}mm`,
          top: `${bleed.top}mm`,
          width: `${book.pageSetup.width}mm`,
          height: `${book.pageSetup.height}mm`,
        };
        return (
          <article
            className="pdf-export-page"
            data-output-page={outputIndex + 1}
            data-physical-page={physicalIndex + 1}
            key={`${page.id}-${physicalIndex}`}
            style={pageStyle}
          >
            <div className="pdf-export-trim" style={trimStyle}>
              <ComposedTextLayer layoutPage={layoutPage} styles={book.styles} units={physicalUnits} />
              <EditorialFolio
                label={folio.label}
                visible={folio.visible}
                physicalIndex={physicalIndex}
                setup={book.pageSetup}
                placement={book.numbering.placement}
                units={physicalUnits}
              />
            </div>
            <div className="pdf-static-object-layer">
              {page.objects
                .filter((object): object is PositionedImageObject => object.type === "image")
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((object) => {
                  const asset = assetMap.get(object.assetId);
                  if (!asset) return null;
                  return (
                    <img
                      className="pdf-static-image"
                      data-object-id={object.id}
                      data-file-name={asset.fileName}
                      key={object.id}
                      src={dataUrl(asset.mimeType, asset.data)}
                      alt=""
                      draggable={false}
                      style={{
                        left: `${bleed.left + object.x}mm`,
                        top: `${bleed.top + object.y}mm`,
                        width: `${object.width}mm`,
                        height: `${object.height}mm`,
                        zIndex: object.zIndex,
                      }}
                    />
                  );
                })}
            </div>
          </article>
        );
      })}
    </section>
  );
}
