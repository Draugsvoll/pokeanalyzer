export type ChartPoint = { x: number; y: number };

export function monotoneLinePath(points: ChartPoint[], endX: number) {
  if (points.length === 0) return "";

  const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
  if (points.length > 1) {
    const widths = points.slice(1).map((point, index) => {
      return point.x - points[index].x;
    });
    const slopes = widths.map((width, index) => {
      return width > 0 ? (points[index + 1].y - points[index].y) / width : 0;
    });
    const tangents = points.map((_, index) => {
      if (index === 0) return slopes[0];
      if (index === points.length - 1) {
        return endX > points[index].x ? 0 : slopes.at(-1)!;
      }

      const previousSlope = slopes[index - 1];
      const nextSlope = slopes[index];
      if (previousSlope * nextSlope <= 0) return 0;

      const previousWidth = widths[index - 1];
      const nextWidth = widths[index];
      const previousWeight = 2 * nextWidth + previousWidth;
      const nextWeight = nextWidth + 2 * previousWidth;
      return (
        (previousWeight + nextWeight) /
        (previousWeight / previousSlope + nextWeight / nextSlope)
      );
    });

    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      const width = point.x - previous.x;
      if (width <= 0) {
        commands.push(`L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
        continue;
      }

      commands.push(
        `C ${(previous.x + width / 3).toFixed(2)} ${(previous.y + (tangents[index - 1] * width) / 3).toFixed(2)} ${(point.x - width / 3).toFixed(2)} ${(point.y - (tangents[index] * width) / 3).toFixed(2)} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
      );
    }
  }

  const lastPoint = points.at(-1)!;
  if (endX > lastPoint.x) {
    commands.push(`L ${endX.toFixed(2)} ${lastPoint.y.toFixed(2)}`);
  }
  return commands.join(" ");
}

export function monotoneAreaPath(
  points: ChartPoint[],
  endX: number,
  baseY: number,
) {
  const line = monotoneLinePath(points, endX);
  if (!line) return "";

  return `${line} L ${endX.toFixed(2)} ${baseY.toFixed(2)} L ${points[0].x.toFixed(2)} ${baseY.toFixed(2)} Z`;
}
