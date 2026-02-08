import { useEffect, useState } from 'react';

interface AnimatedCounterProps {
    value: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
    className?: string;
    decimals?: number;
}

export const AnimatedCounter = ({
    value,
    duration = 1000,
    prefix = '',
    suffix = '',
    className = '',
    decimals = 0
}: AnimatedCounterProps) => {
    const [displayValue, setDisplayValue] = useState(value);

    useEffect(() => {
        let startTime: number | null = null;
        const startValue = displayValue;
        const endValue = value;

        if (startValue === endValue) return;

        // Instant update for 0 duration (prevents 0/0 NaN error)
        if (duration === 0) {
            setDisplayValue(endValue);
            return;
        }

        const animate = (currentTime: number) => {
            if (!startTime) startTime = currentTime;
            const progress = Math.min((currentTime - startTime) / duration, 1);

            // Easing function (easeOutExpo)
            const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

            const current = startValue + (endValue - startValue) * ease;
            setDisplayValue(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value, duration]);

    return (
        <span className={className}>
            {prefix}{displayValue.toLocaleString(undefined, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            })}{suffix}
        </span>
    );
};
