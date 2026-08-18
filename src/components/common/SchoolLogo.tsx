import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

export const SCHOOL_LOGO_URL = 'https://raw.githubusercontent.com/abuhumairoistiqomah/siskadu-2/main/image-removebg-preview%20(8).png';

interface SchoolLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallbackText?: string;
}

export const SchoolLogo: React.FC<SchoolLogoProps> = ({
  className = '',
  size = 'md',
  fallbackText = 'AW 10'
}) => {
  const [hasError, setHasError] = useState(false);

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20'
  }[size];

  if (hasError) {
    return (
      <div className={`${sizeClasses} bg-blue-700 text-white rounded-xl flex flex-col items-center justify-center font-extrabold shadow-xs shrink-0 ${className}`}>
        <BookOpen className="w-4 h-4 text-blue-200" />
        <span className="text-[9px] uppercase tracking-wider font-mono">{fallbackText}</span>
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center shrink-0 ${sizeClasses} ${className}`}>
      <img
        src={SCHOOL_LOGO_URL}
        alt="Logo Rumah Tahfidz Al-Wildan 10"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className="w-full h-full object-contain"
      />
    </div>
  );
};
