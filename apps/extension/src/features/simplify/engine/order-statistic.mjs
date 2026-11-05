// Return the same finite numeric value as sorting, without sorting every item.
// The caller owns the array; partitioning changes its order.
export function orderStatistic(values, index) {
  let left = 0,
    right = values.length - 1;
  while (left < right) {
    const pivot = values[(left + right) >>> 1];
    let low = left,
      scan = left,
      high = right;
    while (scan <= high) {
      const value = values[scan];
      if (value < pivot) {
        values[scan] = values[low];
        values[low] = value;
        low++;
        scan++;
      } else if (value > pivot) {
        values[scan] = values[high];
        values[high] = value;
        high--;
      } else scan++;
    }
    if (index < low) right = low - 1;
    else if (index > high) left = high + 1;
    else return values[index];
  }
  return values[index];
}
