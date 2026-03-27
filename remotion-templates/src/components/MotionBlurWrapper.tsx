import React from "react";
import { CameraMotionBlur } from "@remotion/motion-blur";

export type MotionBlurWrapperProps = {
  enabled: boolean;
  children: React.ReactNode;
};

export const MotionBlurWrapper: React.FC<MotionBlurWrapperProps> = ({
  enabled,
  children,
}) => {
  if (!enabled) return <>{children}</>;
  return (
    <CameraMotionBlur shutterAngle={180} samples={10}>
      {children}
    </CameraMotionBlur>
  );
};
