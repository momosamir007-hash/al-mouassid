import type { CommonError } from "@/lib/arith";

export function describeCommonError(e: CommonError): string {
  switch (e) {
    case "order_of_operations":
      return "حساب العمليات من اليسار إلى اليمين دون مراعاة أولوية العمليات";
    case "sign":
      return "خطأ في الإشارة";
    case "rounding":
      return "خطأ في التقريب";
    case "off_by_one":
      return "خطأ بمقدار وحدة واحدة في آخر عملية";
  }
}
