import React from 'react';
import { PageHeading } from '../../components/PageHeading';
import CsvImportSection from './CsvImportSection';

const ImportPage: React.FC = () => (
  <div className="space-y-6">
    <PageHeading
      title="Import CSV"
      subtitle="Choisissez le mode, la source et le compte cible avant de valider un préflight qui met en avant les doublons, le mapping et la qualité des données."
    />
    <CsvImportSection />
  </div>
);

export default ImportPage;
