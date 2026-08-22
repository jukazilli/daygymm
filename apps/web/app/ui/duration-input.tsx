"use client";

import { useEffect, useRef, useState } from "react";

import {
  formatTrainingDuration,
  parseTrainingDuration,
} from "../../lib/training-duration";

export function DurationInput({
  ariaLabel,
  describedBy,
  maximum,
  minimum,
  onChange,
  required = false,
  seconds,
}: Readonly<{
  ariaLabel?: string;
  describedBy?: string;
  maximum: number;
  minimum: number;
  onChange: (seconds: number | null) => void;
  required?: boolean;
  seconds: number | null;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rawValue, setRawValue] = useState(
    seconds === null ? "" : formatTrainingDuration(seconds),
  );
  const parsed = parseTrainingDuration(rawValue);
  const invalid =
    rawValue.length > 0 &&
    (parsed === null || parsed < minimum || parsed > maximum);

  useEffect(() => {
    if (inputRef.current === document.activeElement) {
      return;
    }
    setRawValue(seconds === null ? "" : formatTrainingDuration(seconds));
  }, [seconds]);

  function updateValidity(element: HTMLInputElement, isInvalid: boolean) {
    element.setCustomValidity(
      isInvalid
        ? `Use HH:MM:SS, entre ${formatTrainingDuration(minimum)} e ${formatTrainingDuration(maximum)}.`
        : "",
    );
  }

  return (
    <input
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-label={ariaLabel}
      inputMode="numeric"
      onBlur={(event) => {
        updateValidity(event.currentTarget, invalid);
        if (!invalid && parsed !== null) {
          setRawValue(formatTrainingDuration(parsed));
        }
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (!/^[\d:]*$/.test(next) || next.length > 8) {
          return;
        }
        setRawValue(next);
        if (!next) {
          updateValidity(event.currentTarget, false);
          onChange(null);
          return;
        }
        const nextSeconds = parseTrainingDuration(next);
        const nextInvalid =
          nextSeconds === null ||
          nextSeconds < minimum ||
          nextSeconds > maximum;
        updateValidity(event.currentTarget, nextInvalid);
        if (!nextInvalid) {
          onChange(nextSeconds);
        }
      }}
      placeholder="00:00:00"
      ref={inputRef}
      required={required}
      type="text"
      value={rawValue}
    />
  );
}
