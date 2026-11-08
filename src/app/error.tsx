"use client";

import { ErrorPage } from "../views/error";

export default function ErrorPageRoute({ reset }: { reset: () => void }) {
  return <ErrorPage reset={reset} />;
}
