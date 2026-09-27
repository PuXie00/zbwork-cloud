import * as React from "react";

import { cn } from "./utils";

interface InputProps extends React.ComponentProps<"input"> {
  allowDecimal?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, value, onChange, allowDecimal, ...props }, ref) => {
    const [innerValue, setInnerValue] = React.useState<string | number | readonly string[]>(value ?? "");

    React.useEffect(() => {
      if (type === "number") {
        const numericValue = (value === "" || value === undefined || value === null) ? NaN : Number(value);
        const currentNumeric = (innerValue === "" || innerValue === "-" || innerValue === "." || innerValue === "-.") ? NaN : Number(innerValue);
        
        // 只有当数值真正改变时才更新内部状态，以保留用户输入的中间状态（如减号、小数点）
        if (!isNaN(numericValue) && numericValue !== currentNumeric) {
          setInnerValue(value!.toString());
        } else if ((value === "" || value === undefined || value === null) && innerValue !== "") {
          setInnerValue("");
        }
      } else {
        setInnerValue(value ?? "");
      }
    }, [value, type]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (type === "number") {
        const val = e.target.value;
        
        // 允许的中间状态
        if (val === "" || val === "-" || (allowDecimal && (val === "." || val === "-."))) {
          setInnerValue(val);
          if (onChange) {
            const originalValue = e.target.value;
            e.target.value = val;
            onChange(e);
            e.target.value = originalValue;
          }
          return;
        }

        if (allowDecimal) {
          // 允许带小数点的数字格式
          if (/^-?\d*\.?\d*$/.test(val)) {
            setInnerValue(val);
            if (onChange) {
              onChange(e);
            }
          }
        } else {
          // 仅允许整数
          const parsed = parseInt(val, 10);
          if (!isNaN(parsed)) {
            // 只有当解析出的整数与输入字符串匹配时（或者是为了修正输入），才更新
            const stringVal = parsed.toString();
            setInnerValue(stringVal);
            if (onChange) {
              const originalValue = e.target.value;
              e.target.value = stringVal;
              onChange(e);
              e.target.value = originalValue;
            }
          }
        }
        return;
      }
      setInnerValue(e.target.value);
      onChange?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (type === "number") {
        const val = e.target.value;
        if (val === "" || val === "-" || val === "." || val === "-.") {
          const resetValue = "0";
          setInnerValue(resetValue);
          if (onChange) {
            // 模拟 onChange 事件以通知父组件更新为 0
            const event = {
              ...e,
              target: { ...e.target, value: resetValue },
              currentTarget: { ...e.currentTarget, value: resetValue }
            } as unknown as React.ChangeEvent<HTMLInputElement>;
            onChange(event);
          }
        }
      }
      props.onBlur?.(e);
    };

    return (
      <input
        type={type}
        data-slot="input"
        ref={ref}
        value={innerValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base bg-input-background transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          className,
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
