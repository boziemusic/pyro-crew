"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
} from "react";

type NativeDateInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

export const NativeDateInput = forwardRef<
  HTMLInputElement,
  NativeDateInputProps
>(function NativeDateInput({ className = "", ...props }, forwardedRef) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

  const openDatePicker = () => {
    const input = inputRef.current;

    if (!input || input.disabled) {
      return;
    }

    input.focus();

    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.click();
    }
  };

  return (
    <div className="relative">
      <input
        {...props}
        className={`native-date-input ${className} w-full pr-12`}
        ref={inputRef}
        type="date"
      />
      <button
        aria-label="Open calendar"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-[#cbd5e1] transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#8b5cf6]"
        disabled={props.disabled}
        onClick={openDatePicker}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M7 3v3m10-3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>
    </div>
  );
});
