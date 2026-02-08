
import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import clsx from 'clsx';

interface WinnerAnnouncementProps {
    winner: 'meron' | 'wala' | 'draw' | null;
    meronName: string;
    walaName: string;
    onClose: () => void;
}

export const WinnerAnnouncement = ({ winner, meronName, walaName, onClose }: WinnerAnnouncementProps) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (winner) {
            setVisible(true);
            const timer = setTimeout(() => {
                setVisible(false);
                setTimeout(onClose, 500); // Allow fade out
            }, 5000); // Show for 5 seconds
            return () => clearTimeout(timer);
        }
    }, [winner, onClose]);

    if (!winner) return null;

    return (
        <div className={clsx(
            "fixed inset-0 z-50 flex items-center justify-center pointer-events-none transition-all duration-500",
            visible ? "bg-black/80 backdrop-blur-sm opacity-100" : "opacity-0"
        )}>
            <div className={clsx(
                "transform transition-all duration-700 flex flex-col items-center",
                visible ? "scale-100 translate-y-0" : "scale-50 translate-y-20"
            )}>
                {/* GLOW EFFECT */}
                <div className={clsx(
                    "absolute inset-0 blur-[100px] rounded-full opacity-50",
                    winner === 'meron' ? "bg-red-600" :
                        winner === 'wala' ? "bg-blue-600" : "bg-green-600"
                )} />

                <div className="relative flex flex-col items-center gap-6 p-12">
                    <Trophy className={clsx(
                        "w-32 h-32 drop-shadow-2xl animate-bounce",
                        winner === 'meron' ? "text-red-500" :
                            winner === 'wala' ? "text-blue-500" : "text-green-500"
                    )} />

                    <div className="flex flex-col items-center text-center gap-2">
                        <span className="text-4xl font-black text-white uppercase tracking-[0.2em] drop-shadow-lg">
                            {winner === 'draw' ? 'RESULT' : 'WINNER'}
                        </span>
                        <h1 className={clsx(
                            "text-6xl font-display font-black uppercase tracking-wider drop-shadow-[0_0_25px_rgba(0,0,0,0.8)]",
                            winner === 'meron' ? "text-red-500" :
                                winner === 'wala' ? "text-blue-500" : "text-green-500"
                        )}>
                            {winner === 'meron' ? meronName :
                                winner === 'wala' ? walaName : 'DRAW'}
                        </h1>
                        <span className={clsx(
                            "px-6 py-2 rounded-full border bg-black/40 backdrop-blur-md text-white font-bold uppercase tracking-widest text-sm mt-4",
                            winner === 'meron' ? "border-red-500/50" :
                                winner === 'wala' ? "border-blue-500/50" : "border-green-500/50"
                        )}>
                            {winner === 'meron' ? 'MERON WINS' :
                                winner === 'wala' ? 'WALA WINS' : 'DRAW MATCH'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
