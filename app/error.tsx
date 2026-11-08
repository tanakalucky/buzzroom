"use client";

import { ErrorPage } from "../src/views/error";

export default function ErrorPageRoute({ reset }: { reset: () => void }) {
  return <ErrorPage reset={reset} />;
}
