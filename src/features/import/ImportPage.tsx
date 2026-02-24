import React from 'react';
import { PageHeading } from '../../components/PageHeading';
import CsvImportSection from './CsvImportSection';

const ImportPage: React.FC = () => (
  <div className="space-y-6">
    <PageHeading
      title="Import CSV"
      subtitle="Ajoutez rapidement des transactions normalisées sans passer par les réglages."
    />
    <CsvImportSection />
  </div>
);

export default ImportPage;
