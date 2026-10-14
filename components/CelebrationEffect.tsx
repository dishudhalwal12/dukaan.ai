import React from 'react';

const CONFETTI_COUNT = 100;
const COLORS = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];

const ConfettiPiece: React.FC<{ index: number }> = ({ index }) => {
    const style: React.CSSProperties = {
        position: 'absolute',
        width: `${Math.random() * 8 + 4}px`,
        height: `${Math.random() * 12 + 6}px`,
        backgroundColor: COLORS[Math.floor(Math.random() * COLORS.length)],
        top: '-20px',
        left: `${Math.random() * 100}%`,
        opacity: 1,
        animation: `confetti-fall ${Math.random() * 3 + 2}s linear ${Math.random() * 2}s forwards`,
        transform: `rotate(${Math.random() * 360}deg)`,
    };

    return <div style={style} />;
};

const CelebrationEffect: React.FC = () => {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
            {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
                <ConfettiPiece key={i} index={i} />
            ))}
        </div>
    );
};

export default CelebrationEffect;
