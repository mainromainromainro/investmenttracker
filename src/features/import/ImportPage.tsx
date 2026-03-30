import React from 'react';
import { PageHeading } from '../../components/PageHeading';
import CsvImportSection from './CsvImportSection';

const ImportPage: React.FC = () => (
  <div className="mx-auto max-w-5xl space-y-6">
    <PageHeading
      title="Import CSV"
      subtitle="Déposez un fichier, vérifiez rapidement les lignes reconnues, puis importez."
    />
    <CsvImportSection />
  </div>
);

export default ImportPage;
