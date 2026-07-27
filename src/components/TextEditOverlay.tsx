import { useEffect, useRef, useState } from "react";
import type { TextObject } from "../types";

export interface TextEditTarget {
  obj: TextObject;
  screenX: number;
  screenY: number;
  scale: number;
}

export interface TextEditOverlayProps {
  target: TextEditTarget | null;
  onCommit: (id: string, text: string, fontSize: number, color: string) => void;
}

export default function TextEditOverlay({ target, onCommit }: TextEditOverlayProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (target) {
      setValue(target.obj.text);
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [target?.obj.id]);

  if (!target) return null;

  const commit = () => {
    onCommit(target.obj.id, value, target.obj.fontSize, target.obj.color);
  };

  return (
    <textarea
      ref={ref}
      className="text-edit-overlay"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.blur();
        }
      }}
      style={{
        left: target.screenX,
        top: target.screenY,
        width: target.obj.width * target.scale,
        minHeight: target.obj.height * target.scale,
        fontSize: target.obj.fontSize * target.scale,
        color: target.obj.color,
      }}
    />
  );
}
