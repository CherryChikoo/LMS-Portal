import { toMillis } from "./src/lib/utils/date";

const mockTimestamp = {
  seconds: 1723485000,
  nanoseconds: 0,
  toMillis: () => 1723485000000
};

console.log("Mock toMillis:", toMillis(mockTimestamp));
console.log("String toMillis:", toMillis("2026-08-12T10:00:00Z"));
console.log("Date toMillis:", toMillis(new Date()));
