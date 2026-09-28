/**
 * Reel motion, in four phases per reel:
 *   1. ramp    – quick acceleration to full speed
 *   2. cruise  – constant fast spin (longer for each reel → staggered stops)
 *   3. brake   – smooth deceleration that slightly overshoots the target row
 *   4. settle  – a small spring back onto the row
 * The brake starts at exactly the cruise speed, so there is no visible jolt.
 */

export const ROW_HEIGHT = 76;
export const VISIBLE_ROWS = 3;

const SPEED = ROW_HEIGHT * 20; // px per second while cruising (20 rows/s)
const RAMP_S = 0.16;
const BRAKE_S = 0.95;
export const OVERSHOOT = 14; // px past the target row before settling back
const CRUISE_S = [0.35, 0.8, 1.25];

const rampDistance = (SPEED * RAMP_S) / 2; // accelerating from 0 to SPEED
const brakeDistance = (SPEED * BRAKE_S) / 3; // ease-out-cubic starting at SPEED

/** How many rows a reel's strip needs so that it lands on its target row. */
export function stripLength(reel: number): number {
  const cruise = CRUISE_S[reel] ?? CRUISE_S[CRUISE_S.length - 1];
  const distance = rampDistance + SPEED * cruise + brakeDistance - OVERSHOOT;
  return Math.round(distance / ROW_HEIGHT) + VISIBLE_ROWS;
}

/** Positions (translateY, negative = scrolled down) and durations for a strip. */
export function reelPhases(length: number) {
  const target = (length - VISIBLE_ROWS) * ROW_HEIGHT;
  const cruiseDistance = Math.max(0, target + OVERSHOOT - rampDistance - brakeDistance);
  return {
    rampEnd: -rampDistance,
    rampMs: RAMP_S * 1000,
    cruiseEnd: -(rampDistance + cruiseDistance),
    cruiseMs: (cruiseDistance / SPEED) * 1000,
    brakeEnd: -(target + OVERSHOOT),
    brakeMs: BRAKE_S * 1000,
    final: -target,
  };
}
