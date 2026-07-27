export interface Command {
  do(): void;
  undo(): void;
}

export class HistoryStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private readonly maxSize = 200;
  private onChange: (() => void) | null = null;

  setOnChange(cb: () => void) {
    this.onChange = cb;
  }

  /** Executes the command immediately and records it. */
  push(command: Command) {
    command.do();
    this.pushExecuted(command);
  }

  /** Records a command that has already been applied live (e.g. a drag gesture), without re-running `do`. */
  pushExecuted(command: Command) {
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack = [];
    this.onChange?.();
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.onChange?.();
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.do();
    this.undoStack.push(cmd);
    this.onChange?.();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
