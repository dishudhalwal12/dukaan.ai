import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`flex flex-col gap-2 rounded-xl p-4 bg-[#1A1A1A] ${className}`}>
      {children}
    </div>
  );
};

export default Card;