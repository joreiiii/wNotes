import { create } from "zustand";
import type { ToolId } from "../types";

export const PEN_COLORS = ["#1c1c1e", "#d92b2b", "#1f6fd9", "#1f9d55", "#e08e0b"];
export const MARKER_COLORS = ["#fff066", "#8ee6a3", "#8ec9ff", "#f7a8c4"];

interface ToolState {
  tool: ToolId;
  color: string;
  width: number;
  shapeMode: boolean;
  setTool: (tool: ToolId) => void;
  setColor: (color: string) => void;
  setWidth: (width: number) => void;
  setShapeMode: (enabled: boolean) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  tool: "pen",
  color: PEN_COLORS[0],
  width: 3,
  shapeMode: false,
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setWidth: (width) => set({ width }),
  setShapeMode: (shapeMode) => set({ shapeMode }),
}));
