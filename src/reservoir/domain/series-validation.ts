import { err, ok, type Result } from "../../domain/result";
import type { PropertyFrame, WellLogCurve, WellTrajectory } from "./types";
import type { ReservoirValidationError } from "./grid-validation";

export function validatePropertyFrame(
  frame: PropertyFrame,
  expectedValueCount: number
): Result<PropertyFrame, ReservoirValidationError> {
  if (!frame.propertyId.trim() || !Number.isSafeInteger(frame.timeStepIndex) || frame.timeStepIndex < 0) {
    return invalid("invalid-property-frame-metadata", "Property frame ID and time-step index are invalid.");
  }

  if (!Number.isSafeInteger(expectedValueCount) || expectedValueCount < 0 || frame.values.length !== expectedValueCount) {
    return invalid("invalid-property-frame-length", "Property frame values must match the expected tuple count.");
  }

  if (frame.validityMask && frame.validityMask.length !== frame.values.length) {
    return invalid("invalid-validity-mask-length", "Validity mask length must match value length.");
  }

  return ok(frame);
}

export function validateWellTrajectory(
  trajectory: WellTrajectory
): Result<WellTrajectory, ReservoirValidationError> {
  if (!trajectory.wellId.trim() || !trajectory.wellName.trim() || !trajectory.datum.trim()) {
    return invalid("invalid-well-trajectory-metadata", "Well ID, name, and datum must be non-empty.");
  }

  if (trajectory.measuredDepths.length === 0 || trajectory.xyz.length !== trajectory.measuredDepths.length * 3) {
    return invalid("invalid-well-trajectory-length", "Trajectory xyz values must contain one xyz triple per measured depth.");
  }

  if (!hasFiniteValues(trajectory.measuredDepths) || !hasFiniteValues(trajectory.xyz)) {
    return invalid("non-finite-well-trajectory", "Trajectory coordinates and measured depths must be finite.");
  }

  return ok(trajectory);
}

export function validateWellLogCurve(curve: WellLogCurve): Result<WellLogCurve, ReservoirValidationError> {
  if (!curve.wellId.trim() || !curve.mnemonic.trim() || !curve.depthReference.trim()) {
    return invalid("invalid-well-log-metadata", "Well ID, mnemonic, and depth reference must be non-empty.");
  }

  if (curve.depths.length !== curve.values.length) {
    return invalid("invalid-well-log-length", "Well log depths and values must have equal lengths.");
  }

  if (curve.validityMask && curve.validityMask.length !== curve.values.length) {
    return invalid("invalid-validity-mask-length", "Validity mask length must match value length.");
  }

  return ok(curve);
}

function hasFiniteValues(values: ArrayLike<number>): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      return false;
    }
  }

  return true;
}

function invalid(code: string, message: string): Result<never, ReservoirValidationError> {
  return err({ code, message });
}