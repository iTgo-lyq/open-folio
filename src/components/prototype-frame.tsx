"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { prototypePermissions } from "../../.agents/skills/spec-trail/prototype/scripts/permissions.mjs";

export function PrototypeFrame(props: ComponentProps<"iframe">) {
  const [allow, setAllow] = useState<string>();
  useEffect(() => setAllow(prototypePermissions(document)), []);
  // Set the policy before navigating, including during server hydration.
  if (allow === undefined) return null;
  return <iframe {...props} allow={allow} allowFullScreen />;
}
