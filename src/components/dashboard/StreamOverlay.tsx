import { useState, useEffect } from 'react';

export const StreamOverlay = () => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    // Format: Jan 19, 2026 3:45:00 PM
    const formattedDate = currentTime.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    const formattedTime = currentTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    });

    return (
        <div className="absolute inset-x-0 top-0 p-4 z-30 pointer-events-none flex justify-between items-start">
            {/* Top Left: Date & Time */}
            <div className="bg-black/60 backdrop-blur-sm border border-white/10 px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-white shadow-lg">
                <div className="text-[7px] md:text-[9px] uppercase font-bold text-casino-gold-400 tracking-widest mb-0.5">
                    Live Time
                </div>
                <div className="font-mono font-bold text-[9px] md:text-xs tracking-wide flex items-center gap-2">
                    <span>{formattedDate}</span>
                    <span className="w-0.5 h-0.5 md:w-1 md:h-1 rounded-full bg-white/50" />
                    <span className="text-white">{formattedTime}</span>
                </div>
            </div>
        </div>
    );
};
