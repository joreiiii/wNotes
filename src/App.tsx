import { useState } from "react";
import LibraryView from "./components/LibraryView";
import EditorView from "./components/EditorView";
import "./App.css";

function App() {
  const [openNotebookId, setOpenNotebookId] = useState<string | null>(null);

  if (openNotebookId) {
    return <EditorView notebookId={openNotebookId} onClose={() => setOpenNotebookId(null)} />;
  }
  return <LibraryView onOpenNotebook={setOpenNotebookId} />;
}

export default App;
