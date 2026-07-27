import type { ImageObject, Stroke, TextObject } from "../../types";

export interface ClipboardPayload {
  strokes: Stroke[];
  textObjects: TextObject[];
  imageObjects: ImageObject[];
}

/** Process-local clipboard (in-memory only) so paste works across pages/notebooks in one session. */
let payload: ClipboardPayload | null = null;

export function setClipboard(data: ClipboardPayload) {
  payload = data;
}

export function getClipboard(): ClipboardPayload | null {
  return payload;
}
