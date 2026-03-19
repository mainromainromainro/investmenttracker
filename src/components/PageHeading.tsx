import React from 'react';

interface PageHeadingProps {
  title: string;
  subtitle?: string;
}

export const PageHeading: React.FC<PageHeadingProps> = ({ title, subtitle }) => (
  <div className="mb-6 animate-fade-up">
    <h2 className="text-3xl font-bold tracking-tight text-[#173326]">{title}</h2>
    {subtitle && <p className="mt-2 text-sm text-[#607060] sm:text-base">{subtitle}</p>}
  </div>
);
