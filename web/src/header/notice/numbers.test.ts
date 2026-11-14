import { expect, test } from "vitest";
import { amount, countWords, memoryWords, sizeWords, timeWords } from "./numbers";

test.each([
  [4, "4"],
  [200, "200"],
  [2000, "2,000"],
  [1.5, "1.5"],
  [999999, "999,999"],
  [1000000, "1 million"],
  [1500000, "1.5 million"],
  [25000000, "25 million"],
  [36340000, "36.3 million"],
  [2000000000, "2 billion"],
])("the count %d is written %s", (count, words) => {
  expect(countWords(count)).toBe(words);
});

test("an amount takes the name of one thing or of several", () => {
  expect(amount(1, "job", "jobs")).toBe("1 job");
  expect(amount(2, "job", "jobs")).toBe("2 jobs");
  expect(amount(1.5, "processor", "processors")).toBe("1.5 processors");
  expect(amount(0.5, "processor", "processors")).toBe("0.5 processors");
});

test.each([
  [1, "1 byte"],
  [999, "999 bytes"],
  [65536, "65.5 kB"],
  [500000000, "500 MB"],
  [2000000000, "2 GB"],
  [20000000000, "20 GB"],
  [1500000000000, "1.5 TB"],
  [3000000000000000, "3,000 TB"],
])("the size of %d bytes of files is written %s, in units of 1000", (bytes, words) => {
  expect(sizeWords(bytes)).toBe(words);
});

test.each([
  [512, "512 bytes"],
  [536870912, "512 MB"],
  [2147483648, "2 GB"],
  [8326627328, "7.8 GB"],
  [1099511627776, "1 TB"],
])("the memory of %d bytes is written %s, in units of 1024", (bytes, words) => {
  expect(memoryWords(bytes)).toBe(words);
});

test.each([
  [1, "1 second"],
  [45, "45 seconds"],
  [60, "1 minute"],
  [90, "90 seconds"],
  [1800, "30 minutes"],
  [2400, "40 minutes"],
  [3600, "1 hour"],
  [5400, "90 minutes"],
  [28800, "8 hours"],
  [86400, "1 day"],
  [129600, "36 hours"],
  [604800, "7 days"],
])("the time of %d seconds is written %s", (seconds, words) => {
  expect(timeWords(seconds)).toBe(words);
});
