import React from 'react';
import { PageHeading } from '../../components/PageHeading';
import CsvImportSection from './CsvImportSection';

const ImportPage: React.FC = () => (
  <div className="space-y-6">
    <PageHeading
      title="Import CSV"
      subtitle="Importez soit des transactions detaillees, soit des snapshots mensuels de positions pour assurer un suivi coherent de mois en mois."
    />
    <CsvImportSection />
  </div>
);

export default ImportPage;
