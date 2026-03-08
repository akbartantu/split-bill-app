import { useEffect, useState } from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import { buildApiUrl } from "@/lib/apiBase";
import { useBillStore } from "@/store/billStore";

/**
 * Deep-link page: /split?t=TOKEN
 * Fetches receipt data from API, loads into store, then redirects to home (participants step).
 */
const Split = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t");
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const loadReceiptFromLink = useBillStore((s) => s.loadReceiptFromLink);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildApiUrl(`/api/receipt-link/${encodeURIComponent(token)}`));
        const json = await res.json();
        if (cancelled) return;
        if (json.ok && json.data) {
          loadReceiptFromLink(json.data);
          setStatus("ok");
        } else {
          setStatus("error");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadReceiptFromLink]);

  if (status === "ok") {
    return <Navigate to="/" replace />;
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <h1 className="mb-4 text-xl font-bold">Link invalid or expired</h1>
          <p className="mb-4 text-muted-foreground">
            This receipt link may have expired. Start from the home page or send a new receipt.
          </p>
          <a href="/" className="text-primary underline hover:text-primary/90">
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <p className="text-muted-foreground">Loading receipt…</p>
      </div>
    </div>
  );
};

export default Split;
