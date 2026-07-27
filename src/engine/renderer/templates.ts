import { Texture } from "pixi.js";
import type { PageTemplate } from "../../types";

export function buildTemplateTexture(template: PageTemplate, width: number, height: number): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const lineColor = template.color ?? "#c7d2e0";
  const spacing = 40;

  switch (template.kind) {
    case "lined": {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      for (let y = spacing * 2; y < canvas.height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
      }
      break;
    }
    case "grid": {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      for (let y = 0; y < canvas.height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
      }
      for (let x = 0; x < canvas.width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();
      }
      break;
    }
    case "dotted": {
      ctx.fillStyle = lineColor;
      for (let y = spacing; y < canvas.height; y += spacing) {
        for (let x = spacing; x < canvas.width; x += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "graph": {
      const minor = spacing / 4;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 0.5;
      for (let y = 0; y < canvas.height; y += minor) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
      }
      for (let x = 0; x < canvas.width; x += minor) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      for (let y = 0; y < canvas.height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
      }
      for (let x = 0; x < canvas.width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();
      }
      break;
    }
    case "blank":
    default:
      break;
  }

  return Texture.from(canvas);
}
