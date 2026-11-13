/** Adapted from Klecks at b86ba7d0edb2c48ad21ca58aae4775fccf329632. MIT: see LICENSE and provenance.json. */
import type { SourcePoint } from '../contracts';

function mix(a: number, b: number, f: number): number {
  return a * (1 - f) + b * f;
}
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}
function pointsToAngleDeg(p1: SourcePoint, p2: SourcePoint): number {
  return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
}
function clamp(num: number, min: number, max: number): number {
  return num < min ? min : num > max ? max : num;
}
const Vec2 = {
  add: function (p1: SourcePoint, p2: SourcePoint): SourcePoint {
    return { x: p1.x + p2.x, y: p1.y + p2.y };
  },
  sub: function (p1: SourcePoint, p2: SourcePoint): SourcePoint {
    return { x: p1.x - p2.x, y: p1.y - p2.y };
  },
  nor: function (p: SourcePoint): SourcePoint {
    const len = Math.sqrt(p.x ** 2 + p.y ** 2);
    return { x: p.x / len, y: p.y / len };
  },
  len: function (p: SourcePoint): number {
    return Math.sqrt(p.x ** 2 + p.y ** 2);
  },
  dist: function (p1: SourcePoint, p2: SourcePoint): number {
    return Vec2.len(Vec2.sub(p1, p2));
  },
  mul: function (p: SourcePoint, s: number): SourcePoint {
    return { x: p.x * s, y: p.y * s };
  },
};
class PointLine {
  private readonly segmentArr: {
    x: number;
    y: number;
    length: number; // last is 0
  }[];

  // ----------------------------------- public -----------------------------------
  constructor(p: { points: SourcePoint[] }) {
    this.segmentArr = [];

    for (let i = 0; i < p.points.length; i++) {
      ((i) => {
        let length = 0;
        if (i < p.points.length - 1) {
          length = dist(p.points[i]!.x, p.points[i]!.y, p.points[i + 1]!.x, p.points[i + 1]!.y);
        }
        this.segmentArr[i] = {
          x: p.points[i]!.x,
          y: p.points[i]!.y,
          length: length,
        };
      })(i);
    }
  }

  // ---- interface ----

  /**
   * returns point when traveling *dist* along the line, > 0
   * @param dist
   */
  getAtDist(dist: number): SourcePoint {
    let remainder = Math.min(this.getLength(), dist);
    let i = 0;

    for (; remainder > this.segmentArr[i]!.length && i < this.segmentArr.length - 2; i++) {
      remainder -= this.segmentArr[i]!.length;
    }

    const fac = Math.min(1, Math.max(0, remainder / this.segmentArr[i]!.length));

    return {
      x: this.segmentArr[i]!.x * (1 - fac) + this.segmentArr[i + 1]!.x * fac,
      y: this.segmentArr[i]!.y * (1 - fac) + this.segmentArr[i + 1]!.y * fac,
    };
  }

  /**
   * total length of line
   */
  getLength(): number {
    let result = 0;
    for (let i = 0; i < this.segmentArr.length - 1; i++) {
      result += this.segmentArr[i]!.length;
    }
    return result;
  }
}

type TBezierLineCallback = (v: {
  x: number;
  y: number;
  t: number; // [0, 1] - how far along
  angle?: number | undefined;
  dAngle: number;
}) => void;
type TBezierLineControlsCallback = (v: {
  p1: SourcePoint;
  p2: SourcePoint;
  p3: SourcePoint;
  p4: SourcePoint;
}) => void;

type TBezierLinePoint = {
  x: number;
  y: number;
  spacing: number;
  dir: SourcePoint;
};

/**
 * Each instance is one line made up of bezier interpolated segments.
 * You feed it points. It calculates control points on its own, and the resulting curve.
 */
export class BezierLine {
  private readonly pointArr: TBezierLinePoint[];
  private lastDot: number = 0;
  private lastPoint: SourcePoint | undefined;
  private lastCallbackPoint: SourcePoint | undefined;
  private lastAngle: number | undefined;
  private lastSpacing: number | undefined;

  /**
   * creates bezier curve from control points
   * @param p1 - control point 1 {x: float, y: float}
   * @param p2 - control point 2 {x: float, y: float}
   * @param p3 - control point 3 {x: float, y: float}
   * @param p4 - control point 4 {x: float, y: float}
   * @param resolution - int
   * @returns bezier curve made up of points {x: float, y: float}
   */
  private getBezierPoints(
    p1: SourcePoint,
    p2: SourcePoint,
    p3: SourcePoint,
    p4: SourcePoint,
    resolution: number
  ): SourcePoint[] {
    const curvePoints = [];
    let t;
    for (let i = 0; i <= resolution; i++) {
      t = i / resolution;
      curvePoints[curvePoints.length] = {
        x:
          (1 - t) ** 3 * p1.x +
          3 * (1 - t) ** 2 * t * p2.x +
          3 * (1 - t) * t ** 2 * p3.x +
          t ** 3 * p4.x,
        y:
          (1 - t) ** 3 * p1.y +
          3 * (1 - t) ** 2 * t * p2.y +
          3 * (1 - t) * t ** 2 * p3.y +
          t ** 3 * p4.y,
      };
    }
    return curvePoints;
  }

  // ----------------------------------- public -----------------------------------
  constructor() {
    this.pointArr = [];
  }

  // ---- interface ----

  /**
   * Add new point to line. "Drawn" line will go until the previous point.
   *
   * @param x - coord of new point
   * @param y
   * @param spacing - space between each step
   * @param callback - calls for each step
   * @param controlsCallback - calls that callback with the bezier control points
   */
  add(
    x: number,
    y: number,
    spacing: number,
    callback?: TBezierLineCallback,
    controlsCallback?: TBezierLineControlsCallback
  ): void {
    if (this.lastPoint && x === this.lastPoint.x && y === this.lastPoint.y) {
      return;
    }
    this.lastPoint = { x, y };
    this.pointArr[this.pointArr.length] = { x, y, spacing, dir: { x: 0, y: 0 } };

    //calculate directions
    if (this.pointArr.length === 1) {
      this.lastSpacing = spacing;
      return;
    } else if (this.pointArr.length === 2) {
      this.pointArr[0]!.dir = Vec2.nor(Vec2.sub(this.pointArr[1]!, this.pointArr[0]!));
      this.lastDot = spacing;
      this.lastSpacing = spacing;
      return;
    } else {
      const pointM1 = this.pointArr.at(-1)!;
      const pointM2 = this.pointArr.at(-2)!;
      const pointM3 = this.pointArr.at(-3)!;
      pointM2.dir = Vec2.nor(Vec2.sub(pointM1, pointM3));
      if (isNaN(pointM2.dir.x) || isNaN(pointM2.dir.y)) {
        //when xy -3 == -1
        pointM2.dir = { ...pointM3.dir };
      }
    }

    //get bezier curve
    const a = this.pointArr.at(-3)!;
    const b = this.pointArr.at(-2)!;
    const p1 = a;
    const p2 = Vec2.add(a, Vec2.mul(a.dir, Vec2.dist(a, b) / 4));
    const p3 = Vec2.sub(b, Vec2.mul(b.dir, Vec2.dist(a, b) / 4));
    const p4 = b;

    let pointLine: PointLine;
    if (callback) {
      const curvePoints = this.getBezierPoints(p1, p2, p3, p4, 20);
      pointLine = new PointLine({ points: curvePoints });
    } else {
      pointLine = new PointLine({ points: [p1, p4] });
    }

    //iterate over curve with spacing and callback
    const len = pointLine.getLength();
    let tempSpacing = mix(this.lastSpacing!, spacing, clamp(this.lastDot / len, 0, 1));
    let d = this.lastDot;
    for (; d <= len; d += tempSpacing) {
      tempSpacing = mix(this.lastSpacing!, spacing, clamp(d / len, 0, 1));
      const point = pointLine.getAtDist(d);
      const angle = this.lastCallbackPoint
        ? pointsToAngleDeg(this.lastCallbackPoint, point)
        : undefined;
      if (callback) {
        callback({
          x: point.x,
          y: point.y,
          t: d / len,
          angle: angle,
          dAngle: this.lastCallbackPoint ? angle! - this.lastAngle! : 0,
        });
      }
      this.lastCallbackPoint = point;
      this.lastAngle = angle;
    }

    if (callback) {
      this.lastDot = d - len;
    } else {
      this.lastDot = 0;
      controlsCallback?.({ p1: p1, p2: p2, p3: p3, p4: p4 });
    }

    this.lastSpacing = spacing;
  }

  addFinal(
    spacing: number,
    callback?: TBezierLineCallback,
    controlsCallback?: TBezierLineControlsCallback
  ): void {
    if (this.pointArr.length < 2) {
      return;
    }

    const p1 = this.pointArr.at(-2)!;
    const p2 = this.pointArr.at(-1)!;

    const newP = Vec2.add(p2, Vec2.sub(p2, p1));

    this.add(newP.x, newP.y, spacing, callback, controlsCallback);
  }
}
