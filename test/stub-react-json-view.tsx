// Test-only stand-in: react-json-view needs a real DOM at import time, which
// the node smoke test doesn't have. Renders the same src prop as plain JSON.
import React from "react";

export default function ReactJsonStub({ src, name }: { src: any; name?: string }) {
  return <pre data-name={name}>{JSON.stringify(src)}</pre>;
}
