import { Suspense } from "react";
import { SolveView } from "@/components/SolveView";

export default function SolvePage() {
  return (
    <Suspense fallback={<p className="text-center text-stone-500">جارٍ التحميل…</p>}>
      <SolveView />
    </Suspense>
  );
}
