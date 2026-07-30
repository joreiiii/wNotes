import { create } from "zustand";

export interface DialogAction {
  id: string;
  label: string;
  destructive?: boolean;
}

interface PromptRequest {
  kind: "prompt";
  title: string;
  label?: string;
  defaultValue: string;
  placeholder?: string;
  confirmLabel: string;
}

interface ConfirmRequest {
  kind: "confirm";
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
}

interface ActionsRequest {
  kind: "actions";
  title: string;
  actions: DialogAction[];
}

type AnyRequest = PromptRequest | ConfirmRequest | ActionsRequest;
export type DialogRequest = AnyRequest & { id: number };

interface DialogState {
  current: DialogRequest | null;
  /** Set while the panel plays its exit animation, so it stays mounted. */
  closing: boolean;
  resolve: ((value: unknown) => void) | null;
  submit: (value: unknown) => void;
  finishClose: () => void;
  request: (req: AnyRequest) => Promise<unknown>;
}

let nextId = 1;

const useDialogStore = create<DialogState>((set, get) => ({
  current: null,
  closing: false,
  resolve: null,

  request: (req) =>
    new Promise((resolve) => {
      // A second request while one is open resolves the first as cancelled.
      const pending = get().resolve;
      if (pending) pending(null);
      set({ current: { ...req, id: nextId++ } as DialogRequest, closing: false, resolve: resolve as (v: unknown) => void });
    }),

  submit: (value) => {
    const { resolve } = get();
    resolve?.(value);
    set({ resolve: null, closing: true });
  },

  finishClose: () => set({ current: null, closing: false }),
}));

export { useDialogStore };

/** Replaces window.prompt — a native dialog would expose the dev-server URL. */
export function promptText(opts: {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return useDialogStore.getState().request({
    kind: "prompt",
    title: opts.title,
    label: opts.label,
    defaultValue: opts.defaultValue ?? "",
    placeholder: opts.placeholder,
    confirmLabel: opts.confirmLabel ?? "OK",
  }) as Promise<string | null>;
}

export function confirmAction(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return useDialogStore
    .getState()
    .request({
      kind: "confirm",
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? "OK",
      destructive: opts.destructive,
    })
    .then((v) => v === true);
}

export function chooseAction(opts: { title: string; actions: DialogAction[] }): Promise<string | null> {
  return useDialogStore.getState().request({
    kind: "actions",
    title: opts.title,
    actions: opts.actions,
  }) as Promise<string | null>;
}
