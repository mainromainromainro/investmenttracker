import React from 'react';

interface PageHeadingProps {
  title: string;
  subtitle?: string;
}

export const PageHeading: React.FC<PageHeadingProps> = ({ title, subtitle }) => (
  <div className="mb-6">
    <h2 className="text-3xl font-bold text-gray-900">{title}</h2>
    {subtitle && <p className="mt-2 text-gray-600">{subtitle}</p>}
  </div>
);
