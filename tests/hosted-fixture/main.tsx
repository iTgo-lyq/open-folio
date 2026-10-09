import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "../../packages/ui/src/index";
import "../../packages/ui/src/styles.css";
import { connectPreview } from "../../.agents/skills/spec-trail/prototype/scripts/bridge.mjs";
function Example() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (location.hash === "#no-bridge") return;
    return connectPreview({ version: location.pathname.split("/")[1] });
  }, []);
  return (
    <main style={{ padding: 24 }}>
      <h1>托管 React 页面</h1>
      <Button variant="primary" onClick={() => setCount(count + 1)}>
        已添加 {count} 次
      </Button>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Example />);
