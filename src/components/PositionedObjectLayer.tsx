import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  AssetReference,
  DocumentGuide,
  PageSetup,
  PositionedImageObject,
  PositionedObject,
} from "../domain/document";
import {
  millimetersToPixels,
  keepObjectRecoverable,
  pixelsToMillimeters,
  resizePositionedObject,
  snapObjectPosition,
  type ResizeHandle,
  type SnapFeedback,
} from "../domain/objectGeometry";
import { resolveFacingEdges } from "../domain/pageGeometry";

interface PositionedObjectLayerProps {
  pageIndex: number;
  setup: PageSetup;
  objects: PositionedObject[];
  assets: AssetReference[];
  guides: DocumentGuide[];
  scale: number;
  selectedObjectId?: string;
  snapEnabled: boolean;
  onSelect: (objectId: string) => void;
  onBeginMutation: () => void;
  onChange: (object: PositionedObject) => void;
  onDelete: (objectId: string) => void;
  onDuplicate: (objectId: string) => void;
  onCopy: (objectId: string) => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  object: PositionedImageObject;
}

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function imageDataUrl(asset: AssetReference): string {
  return `data:${asset.mimeType};base64,${asset.data}`;
}

export function PositionedObjectLayer({
  pageIndex,
  setup,
  objects,
  assets,
  guides,
  scale,
  selectedObjectId,
  snapEnabled,
  onSelect,
  onBeginMutation,
  onChange,
  onDelete,
  onDuplicate,
  onCopy,
  onPaste,
  onUndo,
  onRedo,
}: PositionedObjectLayerProps) {
  const [drag, setDrag] = useState<DragState>();
  const [resize, setResize] = useState<DragState & { handle: ResizeHandle }>();
  const [feedback, setFeedback] = useState<SnapFeedback>({});
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const margins = resolveFacingEdges(setup.margins, pageIndex, setup.mirroredMargins);
  const bleed = resolveFacingEdges(setup.bleed, pageIndex, setup.mirroredMargins);
  const px = (value: number) => millimetersToPixels(value, scale);

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>, object: PositionedImageObject) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(object.id);
    onBeginMutation();
    setDrag({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, object });
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const desiredX = drag.object.x + pixelsToMillimeters(event.clientX - drag.startX, scale);
    const desiredY = drag.object.y + pixelsToMillimeters(event.clientY - drag.startY, scale);
    const snapped = snapObjectPosition(drag.object, desiredX, desiredY, {
      pageWidth: setup.width,
      pageHeight: setup.height,
      margins,
      bleed,
      verticalGuides: guides.filter((guide) => guide.orientation === "vertical").map((guide) => guide.positionMm),
      horizontalGuides: guides.filter((guide) => guide.orientation === "horizontal").map((guide) => guide.positionMm),
    }, scale, snapEnabled);
    const recoverable = keepObjectRecoverable(drag.object, snapped.x, snapped.y, {
      pageWidth: setup.width,
      pageHeight: setup.height,
      bleed,
    });
    setFeedback(snapped.feedback);
    onChange({ ...drag.object, ...recoverable });
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setDrag(undefined);
    setFeedback({});
  };

  const beginResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    object: PositionedImageObject,
    handle: ResizeHandle,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(object.id);
    onBeginMutation();
    setResize({ pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, object, handle });
  };

  const moveResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!resize || event.pointerId !== resize.pointerId) return;
    const next = resizePositionedObject(
      resize.object,
      resize.handle,
      pixelsToMillimeters(event.clientX - resize.startX, scale),
      pixelsToMillimeters(event.clientY - resize.startY, scale),
    );
    onChange(next);
  };

  const endResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!resize || event.pointerId !== resize.pointerId) return;
    setResize(undefined);
  };

  return (
    <div className="positioned-object-layer" contentEditable={false}>
      {objects
        .filter((object): object is PositionedImageObject => object.type === "image")
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((object) => {
          const asset = assetMap.get(object.assetId);
          const selected = selectedObjectId === object.id;
          return (
            <div
              key={object.id}
              className={`positioned-object ${selected ? "selected" : ""}`}
              role="button"
              tabIndex={selected ? 0 : -1}
              aria-label={`Imagem ${asset?.fileName ?? object.id}`}
              data-object-id={object.id}
              style={{
                left: px(bleed.left + object.x),
                top: px(bleed.top + object.y),
                width: px(object.width),
                height: px(object.height),
                zIndex: object.zIndex + 1,
              }}
              onPointerDown={(event) => beginDrag(event, object)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => {
                event.stopPropagation();
                const modifier = event.ctrlKey || event.metaKey;
                const key = event.key.toLowerCase();
                if (modifier && key === "d") {
                  event.preventDefault();
                  onDuplicate(object.id);
                } else if (modifier && key === "z") {
                  event.preventDefault();
                  event.shiftKey ? onRedo() : onUndo();
                } else if (modifier && key === "y") {
                  event.preventDefault();
                  onRedo();
                } else if (event.key === "Delete" || event.key === "Backspace") {
                  event.preventDefault();
                  onDelete(object.id);
                } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                  event.preventDefault();
                  onBeginMutation();
                  const step = event.shiftKey ? 5 : 0.5;
                  onChange({
                    ...object,
                    x: object.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
                    y: object.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
                  });
                }
              }}
              onCopy={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onCopy(object.id);
              }}
              onPaste={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onPaste();
              }}
            >
              {asset?.data
                ? <img src={imageDataUrl(asset)} alt="" draggable={false} />
                : <div className="missing-image">Imagem indisponível</div>}
              {selected && HANDLES.map((handle) => (
                <button
                  key={handle}
                  type="button"
                  className={`resize-handle resize-${handle}`}
                  aria-label={`Redimensionar ${handle}`}
                  onPointerDown={(event) => beginResize(event, object, handle)}
                  onPointerMove={moveResize}
                  onPointerUp={endResize}
                  onPointerCancel={endResize}
                />
              ))}
            </div>
          );
        })}
      {feedback.vertical && (
        <div
          className="snap-feedback snap-feedback-vertical"
          style={{ left: px(bleed.left + feedback.vertical.positionMm) }}
          data-snap-kind={feedback.vertical.kind}
        />
      )}
      {feedback.horizontal && (
        <div
          className="snap-feedback snap-feedback-horizontal"
          style={{ top: px(bleed.top + feedback.horizontal.positionMm) }}
          data-snap-kind={feedback.horizontal.kind}
        />
      )}
    </div>
  );
}
