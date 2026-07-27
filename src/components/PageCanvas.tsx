import { forwardRef } from "react";

const PageCanvas = forwardRef<HTMLDivElement>((_props, ref) => {
  return <div ref={ref} className="page-canvas" />;
});
PageCanvas.displayName = "PageCanvas";

export default PageCanvas;
